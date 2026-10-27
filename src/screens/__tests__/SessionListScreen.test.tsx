import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import SessionListScreen from '../SessionListScreen';
import { fetchSessions } from '../../api/sessions';
import type { SessionCard } from '../../api/types';

jest.mock('../../api/sessions', () => ({ fetchSessions: jest.fn() }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const fetchSessionsMock = fetchSessions as jest.MockedFunction<typeof fetchSessions>;

const card = (id: string, title: string): SessionCard => ({
  session_id: id,
  title,
  cwd: `/repos/${id}`,
  project: id,
  message_count: 4,
  created_at: null,
  last_activity: Date.now() / 1000,
  size_bytes: 1024,
});

beforeEach(() => jest.clearAllMocks());

it('renders the fetched session cards', async () => {
  fetchSessionsMock.mockResolvedValue([card('a', 'Fix the composer'), card('b', 'Add tests')]);
  await render(<SessionListScreen onOpen={jest.fn()} />);

  expect(await screen.findByText('Fix the composer')).toBeOnTheScreen();
  expect(screen.getByText('Add tests')).toBeOnTheScreen();
  expect(screen.getByText('2')).toBeOnTheScreen(); // header count
});

it('opens a session when its card is tapped', async () => {
  const sessions = [card('a', 'Fix the composer')];
  fetchSessionsMock.mockResolvedValue(sessions);
  const onOpen = jest.fn();
  await render(<SessionListScreen onOpen={onOpen} />);

  await fireEvent.press(await screen.findByTestId('session-card-a'));
  expect(onOpen).toHaveBeenCalledWith(sessions[0]);
});

it('shows the error state when loading fails', async () => {
  fetchSessionsMock.mockRejectedValue(new Error('Can’t reach the bridge at http://x.'));
  await render(<SessionListScreen onOpen={jest.fn()} />);

  await waitFor(() => expect(screen.getByText('Couldn’t load')).toBeOnTheScreen());
  expect(screen.getByText(/reach the bridge/)).toBeOnTheScreen();
});

it('pull-to-refresh reloads the list in place', async () => {
  fetchSessionsMock.mockResolvedValue([card('a', 'Before refresh')]);
  await render(<SessionListScreen onOpen={jest.fn()} />);
  await screen.findByText('Before refresh');

  fetchSessionsMock.mockResolvedValue([card('a', 'Before refresh'), card('b', 'Just created')]);
  const refreshControl = screen.getByTestId('session-list').props.refreshControl;
  await waitFor(async () => refreshControl.props.onRefresh());

  expect(await screen.findByText('Just created')).toBeOnTheScreen();
  expect(screen.getByText('2')).toBeOnTheScreen(); // header count updated
});

it('the error screen can be pulled down to retry', async () => {
  fetchSessionsMock.mockRejectedValue(new Error('Can’t reach the bridge at http://x.'));
  await render(<SessionListScreen onOpen={jest.fn()} />);
  await screen.findByText('Couldn’t load');

  fetchSessionsMock.mockResolvedValue([card('a', 'Back online')]);
  const refreshControl = screen.getByTestId('session-error').props.refreshControl;
  await waitFor(async () => refreshControl.props.onRefresh());

  expect(await screen.findByText('Back online')).toBeOnTheScreen();
  expect(screen.queryByText('Couldn’t load')).toBeNull();
});

it('the Retry button reloads, and a failed retry keeps the error', async () => {
  fetchSessionsMock.mockRejectedValue(new Error('Can’t reach the bridge at http://x.'));
  await render(<SessionListScreen onOpen={jest.fn()} />);
  await fireEvent.press(await screen.findByTestId('sessions-retry'));
  await waitFor(() => expect(fetchSessionsMock).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Couldn’t load')).toBeOnTheScreen();
  expect(screen.queryByText('No conversations found.')).toBeNull();

  fetchSessionsMock.mockResolvedValue([card('a', 'Back online')]);
  await fireEvent.press(screen.getByTestId('sessions-retry'));
  expect(await screen.findByText('Back online')).toBeOnTheScreen();
});

it('returning to the app retries by itself only while the error shows', async () => {
  // AppState is a jest mock in this preset: take the screen's listener from it.
  const addListener = AppState.addEventListener as unknown as jest.Mock;
  fetchSessionsMock.mockRejectedValue(new Error('Can’t reach the bridge at http://x.'));
  await render(<SessionListScreen onOpen={jest.fn()} />);
  await screen.findByText('Couldn’t load');

  fetchSessionsMock.mockResolvedValue([card('a', 'Back online')]);
  const onChange = addListener.mock.calls.filter((c) => c[0] === 'change').pop()![1];
  await act(async () => {
    onChange('active');
  });
  expect(await screen.findByText('Back online')).toBeOnTheScreen();

  const calls = fetchSessionsMock.mock.calls.length;
  await act(async () => {
    onChange('active');
  });
  expect(fetchSessionsMock).toHaveBeenCalledTimes(calls);
});

it('the folder button opens Files', async () => {
  fetchSessionsMock.mockResolvedValue([card('a', 'Fix the composer')]);
  const onOpenFiles = jest.fn();
  await render(<SessionListScreen onOpen={jest.fn()} onOpenFiles={onOpenFiles} />);
  await fireEvent.press(await screen.findByTestId('open-files'));
  expect(onOpenFiles).toHaveBeenCalledTimes(1);
});
