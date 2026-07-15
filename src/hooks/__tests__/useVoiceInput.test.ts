// Tests the dictation state machine with expo-audio and the router
// mocked: record → stop → transcript handed to onText (never sent),
// permission denial, and engine failure surfacing through onError.
import { act, renderHook } from '@testing-library/react-native';
import { AudioModule, useAudioRecorder } from 'expo-audio';
import useVoiceInput from '../useVoiceInput';
import { transcriptionRouter } from '../../lib/transcription/router';

jest.mock('../../lib/transcription/router', () => ({
  transcriptionRouter: { transcribe: jest.fn() },
}));

const transcribeMock = transcriptionRouter.transcribe as jest.Mock;
const permissionMock = AudioModule.requestRecordingPermissionsAsync as jest.Mock;
const useRecorderMock = useAudioRecorder as jest.Mock;

function makeRecorder(uri: string | null) {
  return {
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(),
    stop: jest.fn(async () => {}),
    uri,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  permissionMock.mockResolvedValue({ granted: true });
});

it('records, transcribes, and hands the text to onText without sending', async () => {
  const recorder = makeRecorder('file://rec.wav');
  useRecorderMock.mockReturnValue(recorder);
  transcribeMock.mockResolvedValue({ text: 'dictated text', engine: 'apple' });
  const onText = jest.fn();
  const onError = jest.fn();
  const { result } = await renderHook(() => useVoiceInput({ onText, onError }));

  await act(async () => result.current.toggle()); // start
  expect(result.current.status).toBe('recording');
  expect(recorder.record).toHaveBeenCalled();

  await act(async () => result.current.toggle()); // stop + transcribe
  expect(recorder.stop).toHaveBeenCalled();
  // Language comes from settings (default en-US) — engines never auto-detect.
  expect(transcribeMock).toHaveBeenCalledWith('file://rec.wav', { language: 'en-US' });
  expect(onText).toHaveBeenCalledWith('dictated text');
  expect(onError).not.toHaveBeenCalled();
  expect(result.current.status).toBe('idle');
});

it('denied mic permission reports an error and never records', async () => {
  permissionMock.mockResolvedValue({ granted: false });
  const recorder = makeRecorder(null);
  useRecorderMock.mockReturnValue(recorder);
  const onText = jest.fn();
  const onError = jest.fn();
  const { result } = await renderHook(() => useVoiceInput({ onText, onError }));

  await act(async () => result.current.toggle());

  expect(onError).toHaveBeenCalledWith(expect.stringMatching(/permission/i));
  expect(recorder.record).not.toHaveBeenCalled();
  expect(result.current.status).toBe('idle');
});

it('a failed transcription surfaces through onError, not onText', async () => {
  const recorder = makeRecorder('file://rec.wav');
  useRecorderMock.mockReturnValue(recorder);
  transcribeMock.mockResolvedValue({ text: null, engine: null });
  const onText = jest.fn();
  const onError = jest.fn();
  const { result } = await renderHook(() => useVoiceInput({ onText, onError }));

  await act(async () => result.current.toggle());
  await act(async () => result.current.toggle());

  expect(onText).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Transcription failed/));
  expect(result.current.status).toBe('idle');
});

it('a recording that produced no file reports an error', async () => {
  const recorder = makeRecorder(null);
  useRecorderMock.mockReturnValue(recorder);
  const onText = jest.fn();
  const onError = jest.fn();
  const { result } = await renderHook(() => useVoiceInput({ onText, onError }));

  await act(async () => result.current.toggle());
  await act(async () => result.current.toggle());

  expect(transcribeMock).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith('Nothing was recorded.');
});
