import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import NewSessionScreen from '../NewSessionScreen';
import { newSessionStream } from '../../api/sessions';

jest.mock('../../api/sessions', () => ({ newSessionStream: jest.fn() }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

const streamMock = newSessionStream as jest.MockedFunction<typeof newSessionStream>;

beforeEach(() => jest.clearAllMocks());

function lastHandlers() {
  return streamMock.mock.calls[streamMock.mock.calls.length - 1][2];
}

it('starts a named session and opens its chat once it exists', async () => {
  streamMock.mockReturnValue(jest.fn());
  const onCreated = jest.fn();
  await render(<NewSessionScreen onBack={jest.fn()} onCreated={onCreated} />);

  await fireEvent.changeText(screen.getByTestId('new-name'), 'Nov/5 Errands');
  await fireEvent.changeText(screen.getByTestId('new-message'), 'plan my errands');
  await fireEvent.press(screen.getByTestId('new-start'));

  expect(streamMock).toHaveBeenCalledWith('plan my errands', 'Nov/5 Errands', expect.any(Object), [], []);
  expect(screen.getByTestId('new-starting')).toBeOnTheScreen();
  await act(async () => lastHandlers().onSession({ session_id: 'abc', cwd: '/Users/ken', name: 'Nov/5 Errands' }));
  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'abc', title: 'Nov/5 Errands' })),
  );
});

it('shows the error and gives the message back when the start fails', async () => {
  streamMock.mockReturnValue(jest.fn());
  await render(<NewSessionScreen onBack={jest.fn()} onCreated={jest.fn()} />);
  await fireEvent.changeText(screen.getByTestId('new-message'), 'hello');
  await fireEvent.press(screen.getByTestId('new-start'));

  await act(async () => lastHandlers().onError('3 phone turns are already running'));
  expect(await screen.findByTestId('new-error')).toHaveTextContent('3 phone turns are already running');
  expect(screen.getByTestId('new-message').props.value).toBe('hello');
});

it('keeps Start disabled until there is a message', async () => {
  await render(<NewSessionScreen onBack={jest.fn()} onCreated={jest.fn()} />);
  expect(screen.getByTestId('new-start')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('new-start'));
  expect(streamMock).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByTestId('new-message'), 'hi');
  expect(screen.getByTestId('new-start')).toBeEnabled();
});

it('has labeled Photos, Files and Dictate buttons instead of a bare +', async () => {
  await render(<NewSessionScreen onBack={jest.fn()} onCreated={jest.fn()} />);
  expect(screen.getByText('Photos')).toBeOnTheScreen();
  expect(screen.getByText('Files')).toBeOnTheScreen();
  expect(screen.getByText('Dictate')).toBeOnTheScreen();
  expect(screen.queryByTestId('composer-attach')).toBeNull();
});

it('goes back from the header', async () => {
  const onBack = jest.fn();
  await render(<NewSessionScreen onBack={onBack} onCreated={jest.fn()} />);
  await fireEvent.press(screen.getByTestId('new-back'));
  expect(onBack).toHaveBeenCalled();
});
