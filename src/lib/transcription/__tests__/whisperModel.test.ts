import { WhisperModel, type ModelFiles } from '../whisperModel';

function fakeFiles(overrides: Partial<ModelFiles> = {}): ModelFiles {
  return {
    modelPath: '/models/ggml-small.en.bin',
    exists: jest.fn(async () => false),
    download: jest.fn(async () => true),
    remove: jest.fn(async () => {}),
    ...overrides,
  };
}

it('is ready when the file already exists, without downloading', async () => {
  const files = fakeFiles({ exists: jest.fn(async () => true) });
  const model = new WhisperModel(files, 'https://example.com/m.bin');

  expect(await model.isReady()).toBe(true);
  expect(model.getState()).toBe('ready');
  expect(await model.ensureReady()).toBe(true);
  expect(files.download).not.toHaveBeenCalled();
});

it('downloads once with progress and becomes ready', async () => {
  const download = jest.fn(
    async (_url: string, _path: string, onProgress?: (f: number) => void) => {
      onProgress?.(0.5);
      onProgress?.(1);
      return true;
    },
  );
  const model = new WhisperModel(fakeFiles({ download }), 'https://example.com/m.bin');
  const progress: number[] = [];

  expect(await model.ensureReady((f) => progress.push(f))).toBe(true);
  expect(progress).toEqual([0.5, 1]);
  expect(model.getState()).toBe('ready');
});

it('a failed download leaves state error and isReady false', async () => {
  const files = fakeFiles({ download: jest.fn(async () => false) });
  const model = new WhisperModel(files, 'https://example.com/m.bin');

  expect(await model.ensureReady()).toBe(false);
  expect(model.getState()).toBe('error');
});

it('a throwing download is caught as error', async () => {
  const files = fakeFiles({
    download: jest.fn(async () => {
      throw new Error('network');
    }),
  });
  const model = new WhisperModel(files, 'https://example.com/m.bin');

  expect(await model.ensureReady()).toBe(false);
  expect(model.getState()).toBe('error');
});

it('remove resets to not-downloaded', async () => {
  const files = fakeFiles({ exists: jest.fn(async () => true) });
  const model = new WhisperModel(files, 'https://example.com/m.bin');
  await model.isReady();

  await model.remove();
  expect(files.remove).toHaveBeenCalledWith('/models/ggml-small.en.bin');
  expect(model.getState()).toBe('not-downloaded');
});
