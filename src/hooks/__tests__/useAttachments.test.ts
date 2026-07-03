// Tests the attachment pipeline with the Expo modules mocked: permission
// denial, cancel, compression mapping, the MAX_IMAGES cap, and the
// clear/restore dance the composer does around a send.
import { act, renderHook } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import useAttachments, { MAX_IMAGES } from '../useAttachments';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

const permMock = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const launchMock = ImagePicker.launchImageLibraryAsync as jest.Mock;
const manipulateMock = ImageManipulator.manipulateAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  permMock.mockResolvedValue({ granted: true });
  // each picked asset compresses to a downscaled JPEG with base64
  manipulateMock.mockImplementation(async (uri: string) => ({
    uri: `${uri}-small`,
    base64: `b64-of-${uri}`,
  }));
});

it('reports through onDenied when photo permission is refused', async () => {
  permMock.mockResolvedValue({ granted: false });
  const onDenied = jest.fn();
  const { result } = await renderHook(() => useAttachments(onDenied));

  await act(async () => result.current.pick());

  expect(onDenied).toHaveBeenCalledWith(expect.stringMatching(/Photo access/));
  expect(launchMock).not.toHaveBeenCalled();
  expect(result.current.attachments).toEqual([]);
});

it('does nothing when the picker is canceled', async () => {
  launchMock.mockResolvedValue({ canceled: true });
  const { result } = await renderHook(() => useAttachments(jest.fn()));

  await act(async () => result.current.pick());
  expect(result.current.attachments).toEqual([]);
});

it('compresses picked images and keeps their base64', async () => {
  launchMock.mockResolvedValue({ canceled: false, assets: [{ uri: 'a.png' }, { uri: 'b.png' }] });
  const { result } = await renderHook(() => useAttachments(jest.fn()));

  await act(async () => result.current.pick());

  expect(manipulateMock).toHaveBeenCalledWith('a.png', [{ resize: { width: 1024 } }], {
    compress: 0.6,
    format: 'jpeg',
    base64: true,
  });
  expect(result.current.attachments).toEqual([
    { uri: 'a.png-small', base64: 'b64-of-a.png' },
    { uri: 'b.png-small', base64: 'b64-of-b.png' },
  ]);
});

it('drops images whose compression produced no base64', async () => {
  launchMock.mockResolvedValue({ canceled: false, assets: [{ uri: 'ok.png' }, { uri: 'bad.png' }] });
  manipulateMock.mockImplementation(async (uri: string) => ({
    uri: `${uri}-small`,
    base64: uri === 'bad.png' ? undefined : 'data',
  }));
  const { result } = await renderHook(() => useAttachments(jest.fn()));

  await act(async () => result.current.pick());
  expect(result.current.attachments).toEqual([{ uri: 'ok.png-small', base64: 'data' }]);
});

it('caps the total at MAX_IMAGES and passes the remaining budget to the picker', async () => {
  const { result } = await renderHook(() => useAttachments(jest.fn()));

  // fill up to two below the cap
  launchMock.mockResolvedValue({
    canceled: false,
    assets: Array.from({ length: MAX_IMAGES - 2 }, (_, i) => ({ uri: `x${i}.png` })),
  });
  await act(async () => result.current.pick());
  expect(result.current.attachments).toHaveLength(MAX_IMAGES - 2);

  // the next pick may only select 2 more…
  launchMock.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'y1.png' }, { uri: 'y2.png' }, { uri: 'y3.png' }],
  });
  await act(async () => result.current.pick());
  expect(launchMock).toHaveBeenLastCalledWith(expect.objectContaining({ selectionLimit: 2 }));
  // …and even an over-delivering picker result is clamped
  expect(result.current.attachments).toHaveLength(MAX_IMAGES);

  // at the cap, pick() is a no-op that never opens the picker
  launchMock.mockClear();
  await act(async () => result.current.pick());
  expect(launchMock).not.toHaveBeenCalled();
});

it('remove, clear, and restore manage the set', async () => {
  launchMock.mockResolvedValue({ canceled: false, assets: [{ uri: 'a.png' }, { uri: 'b.png' }] });
  const { result } = await renderHook(() => useAttachments(jest.fn()));
  await act(async () => result.current.pick());

  await act(async () => result.current.remove('a.png-small'));
  expect(result.current.attachments.map((a) => a.uri)).toEqual(['b.png-small']);

  const saved = result.current.attachments;
  await act(async () => result.current.clear());
  expect(result.current.attachments).toEqual([]);

  // a failed send hands the images back
  await act(async () => result.current.restore(saved, []));
  expect(result.current.attachments).toEqual(saved);
});

// ── File attachments (the file-drop side) ─────────────────────────────

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    base64() {
      if (this.uri === 'unreadable.pdf') return Promise.reject(new Error('io'));
      return Promise.resolve(`b64-of-${this.uri}`);
    }
  },
}));

const docMock = require('expo-document-picker').getDocumentAsync as jest.Mock;

describe('file picking', () => {
  it('reads picked files as base64 with name and size', async () => {
    docMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'report.pdf', name: 'report.pdf', size: 1234 }],
    });
    const { result } = await renderHook(() => useAttachments(jest.fn()));
    await act(async () => result.current.pickFiles());

    expect(result.current.files).toEqual([
      { uri: 'report.pdf', name: 'report.pdf', size: 1234, base64: 'b64-of-report.pdf' },
    ]);
  });

  it('rejects disallowed extensions with a friendly error', async () => {
    const onError = jest.fn();
    docMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'clip.mp4', name: 'clip.mp4', size: 10 }],
    });
    const { result } = await renderHook(() => useAttachments(onError));
    await act(async () => result.current.pickFiles());

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/aren't supported/));
    expect(result.current.files).toEqual([]);
  });

  it('rejects oversize files but keeps valid ones from the same pick', async () => {
    const onError = jest.fn();
    docMock.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'huge.csv', name: 'huge.csv', size: 21 * 1024 * 1024 },
        { uri: 'ok.csv', name: 'ok.csv', size: 100 },
      ],
    });
    const { result } = await renderHook(() => useAttachments(onError));
    await act(async () => result.current.pickFiles());

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/too big/));
    expect(result.current.files.map((f) => f.name)).toEqual(['ok.csv']);
  });

  it('reports unreadable files instead of crashing', async () => {
    const onError = jest.fn();
    docMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'unreadable.pdf', name: 'unreadable.pdf', size: 10 }],
    });
    const { result } = await renderHook(() => useAttachments(onError));
    await act(async () => result.current.pickFiles());

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Couldn't read/));
    expect(result.current.files).toEqual([]);
  });

  it('caps files at MAX_FILES and no-ops at the cap', async () => {
    docMock.mockResolvedValue({
      canceled: false,
      assets: Array.from({ length: 7 }, (_, i) => ({ uri: `f${i}.txt`, name: `f${i}.txt`, size: 1 })),
    });
    const { result } = await renderHook(() => useAttachments(jest.fn()));
    await act(async () => result.current.pickFiles());
    expect(result.current.files).toHaveLength(5);

    docMock.mockClear();
    await act(async () => result.current.pickFiles());
    expect(docMock).not.toHaveBeenCalled();
  });

  it('removeFile and clear cover the file set too', async () => {
    docMock.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'a.txt', name: 'a.txt', size: 1 },
        { uri: 'b.txt', name: 'b.txt', size: 1 },
      ],
    });
    const { result } = await renderHook(() => useAttachments(jest.fn()));
    await act(async () => result.current.pickFiles());

    await act(async () => result.current.removeFile('a.txt'));
    expect(result.current.files.map((f) => f.name)).toEqual(['b.txt']);

    await act(async () => result.current.clear());
    expect(result.current.files).toEqual([]);
  });
});
