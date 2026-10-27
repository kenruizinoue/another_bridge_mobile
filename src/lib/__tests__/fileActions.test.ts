import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { saveToPhotos } from '../files/fileActions';

const mockDeleteFile = jest.fn();
jest.mock('expo-file-system', () => {
  class Directory {
    exists = true;
    create = jest.fn();
  }
  class File {
    uri = 'file:///cache/bridge_files/gpt.mp4';
    delete = mockDeleteFile;
    static downloadFileAsync = jest.fn(async () => new File());
  }
  return { Directory, File, Paths: { cache: '/cache' } };
});
jest.mock('expo-media-library', () => ({
  Asset: { create: jest.fn() },
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-clipboard', () => ({}));
jest.mock('../../api/client', () => ({ bridgeHeaders: () => ({}) }));

const create = Asset.create as jest.Mock;
const entry = { name: 'gpt.mp4', path: 'gpt_reel/gpt.mp4', kind: 'video' as const, size: 5000, modified: 1000 };
const busy = () => new Error('The operation couldn’t be completed. (PHPhotosErrorDomain error 3301.)');

beforeEach(() => {
  jest.useFakeTimers();
  create.mockReset();
  mockDeleteFile.mockReset();
});
afterEach(() => jest.useRealTimers());

it('saves the downloaded file and then removes the cached copy', async () => {
  create.mockResolvedValue({});
  await saveToPhotos('outputs', entry);
  expect(create).toHaveBeenCalledWith('file:///cache/bridge_files/gpt.mp4');
  expect(mockDeleteFile).toHaveBeenCalledTimes(1);
});

it('tries once more when Photos answers "operation interrupted" (3301)', async () => {
  create.mockRejectedValueOnce(busy()).mockResolvedValueOnce({});
  const saving = saveToPhotos('outputs', entry);
  await jest.advanceTimersByTimeAsync(2000);
  await saving;
  expect(create).toHaveBeenCalledTimes(2);
  expect(mockDeleteFile).toHaveBeenCalledTimes(1);
});

it('explains what to do when Photos stays busy', async () => {
  create.mockRejectedValue(busy());
  const saving = saveToPhotos('outputs', entry);
  const result = expect(saving).rejects.toThrow(/Share, then Save Video/);
  await jest.advanceTimersByTimeAsync(2000);
  await result;
  expect(create).toHaveBeenCalledTimes(2);
  expect(mockDeleteFile).toHaveBeenCalledTimes(1);
});

it('does not retry other errors', async () => {
  create.mockRejectedValue(new Error('Audio files are not supported'));
  await expect(saveToPhotos('outputs', entry)).rejects.toThrow('Audio files are not supported');
  expect(create).toHaveBeenCalledTimes(1);
});

it('asks for Photos access first', async () => {
  (requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
  await expect(saveToPhotos('outputs', entry)).rejects.toThrow(/Allow saving to Photos/);
  expect(create).not.toHaveBeenCalled();
});
