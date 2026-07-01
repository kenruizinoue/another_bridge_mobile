import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
