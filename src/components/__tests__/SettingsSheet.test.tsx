// The settings sheet: three engine tabs (same trio as another_interviewer),
// the whisper model download kick, and the version row.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SettingsSheet from '../SettingsSheet';
import {
  getTranscribePreference,
  getVoiceLanguage,
  setTranscribePreference,
  setVoiceLanguage,
} from '../../lib/transcription/preference';
import { whisperModel } from '../../lib/transcription/whisperModel';

jest.mock('../../lib/transcription/preference', () => ({
  getTranscribePreference: jest.fn(),
  getVoiceLanguage: jest.fn(),
  setTranscribePreference: jest.fn(),
  setVoiceLanguage: jest.fn(),
}));
jest.mock('../../lib/transcription/whisperModel', () => ({
  WHISPER_MODEL_SIZE_MB: 466,
  whisperModel: {
    isReady: jest.fn(),
    getState: jest.fn(),
    ensureReady: jest.fn(),
  },
}));

const getPrefMock = getTranscribePreference as jest.Mock;
const setPrefMock = setTranscribePreference as jest.Mock;
const getLangMock = getVoiceLanguage as jest.Mock;
const setLangMock = setVoiceLanguage as jest.Mock;
const isReadyMock = whisperModel.isReady as jest.Mock;
const getStateMock = whisperModel.getState as jest.Mock;
const ensureReadyMock = whisperModel.ensureReady as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getPrefMock.mockResolvedValue('apple');
  getLangMock.mockResolvedValue('en-US');
  isReadyMock.mockResolvedValue(false);
  getStateMock.mockReturnValue('not-downloaded');
  ensureReadyMock.mockResolvedValue(true);
});

it('shows the three engine tabs and the app version', async () => {
  await render(<SettingsSheet visible onClose={jest.fn()} />);

  expect(screen.getByTestId('engine-apple')).toBeOnTheScreen();
  expect(screen.getByTestId('engine-whisper')).toBeOnTheScreen();
  expect(screen.getByTestId('engine-openai')).toBeOnTheScreen();
  // Constants.expoConfig is not populated under jest — assert the row,
  // not the resolved number.
  expect(screen.getByTestId('settings-version')).toHaveTextContent(/another_bridge_mobile v/);
});

it('selecting an engine persists the preference', async () => {
  await render(<SettingsSheet visible onClose={jest.fn()} />);

  await fireEvent.press(screen.getByTestId('engine-openai'));
  await waitFor(() => expect(setPrefMock).toHaveBeenCalledWith('openai'));
});

it('selecting whisper with no model kicks the download', async () => {
  await render(<SettingsSheet visible onClose={jest.fn()} />);

  await fireEvent.press(screen.getByTestId('engine-whisper'));
  await waitFor(() => expect(ensureReadyMock).toHaveBeenCalled());
});

it('selecting whisper with the model already there does not re-download', async () => {
  isReadyMock.mockResolvedValue(true);
  getStateMock.mockReturnValue('ready');
  await render(<SettingsSheet visible onClose={jest.fn()} />);

  await fireEvent.press(screen.getByTestId('engine-whisper'));
  await waitFor(() => expect(setPrefMock).toHaveBeenCalledWith('whisper'));
  expect(ensureReadyMock).not.toHaveBeenCalled();
});

it('shows both language tabs and persists a language change', async () => {
  await render(<SettingsSheet visible onClose={jest.fn()} />);

  expect(screen.getByTestId('language-en-US')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('language-es-ES'));
  await waitFor(() => expect(setLangMock).toHaveBeenCalledWith('es-ES'));
});

it('warns to keep the app open while the model downloads', async () => {
  // A download that never finishes keeps the sheet in the downloading state.
  ensureReadyMock.mockReturnValue(new Promise(() => {}));
  await render(<SettingsSheet visible onClose={jest.fn()} />);

  await fireEvent.press(screen.getByTestId('engine-whisper'));
  await waitFor(() => expect(screen.getByTestId('download-warning')).toBeOnTheScreen());
  expect(screen.getByTestId('download-warning')).toHaveTextContent(/Keep the app open/);
});

it('selecting OpenAI without a key shows the missing-key warning', async () => {
  await render(<SettingsSheet visible onClose={jest.fn()} />);

  expect(screen.queryByTestId('openai-key-warning')).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('engine-openai'));
  await waitFor(() => expect(screen.getByTestId('openai-key-warning')).toBeOnTheScreen());
  expect(screen.getByTestId('openai-key-warning')).toHaveTextContent(
    /EXPO_PUBLIC_OPENAI_API_KEY/,
  );
});

it('no warning when the OpenAI key is present', async () => {
  process.env.EXPO_PUBLIC_OPENAI_API_KEY = 'sk-test';
  try {
    await render(<SettingsSheet visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('engine-openai'));
    await waitFor(() => expect(setPrefMock).toHaveBeenCalledWith('openai'));
    expect(screen.queryByTestId('openai-key-warning')).not.toBeOnTheScreen();
  } finally {
    delete process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  }
});

it('close button calls onClose', async () => {
  const onClose = jest.fn();
  await render(<SettingsSheet visible onClose={onClose} />);

  await fireEvent.press(screen.getByTestId('settings-close'));
  expect(onClose).toHaveBeenCalled();
});
