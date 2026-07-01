// Top-level navigation: the two-screen list ↔ chat switch in App.tsx,
// with only the API mocked. Mirrors the Detox journey so the wiring is
// covered without a simulator.
import { fireEvent, render, screen } from '@testing-library/react-native';
import App from '../../App';
import { fetchMessages, fetchSessions, resumeStatus } from '../api/sessions';

jest.mock('../api/sessions', () => ({
  enqueueResume: jest.fn(),
  fetchMessages: jest.fn(),
  fetchSessions: jest.fn(),
  resumeSessionStream: jest.fn(),
  resumeStatus: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const fetchSessionsMock = fetchSessions as jest.MockedFunction<typeof fetchSessions>;
const fetchMessagesMock = fetchMessages as jest.MockedFunction<typeof fetchMessages>;
const resumeStatusMock = resumeStatus as jest.MockedFunction<typeof resumeStatus>;

it('opens a session from the list and returns with the back button', async () => {
  fetchSessionsMock.mockResolvedValue([
    {
      session_id: 's1',
      title: 'Fix the parser',
      cwd: '/repo',
      project: 'parser-repo',
      message_count: 2,
      created_at: null,
      last_activity: Date.now() / 1000,
      size_bytes: 1,
    },
  ]);
  fetchMessagesMock.mockResolvedValue({
    messages: [
      { index: 1, uuid: 'u1', role: 'assistant', text: 'hello from claude', tool_calls: 0, tools: [], timestamp: null },
    ],
    total: 1,
    has_more: false,
    next_before: null,
  });
  resumeStatusMock.mockResolvedValue({ running: false, started_at: null, queued: [], queue_count: 0 });

  await render(<App />);

  // list → chat
  await fireEvent.press(await screen.findByTestId('session-card-s1'));
  expect(await screen.findByText('hello from claude')).toBeOnTheScreen();
  expect(screen.getByText(/parser-repo · 2 msgs/)).toBeOnTheScreen();

  // chat → list
  await fireEvent.press(screen.getByTestId('chat-back'));
  expect(await screen.findByText('Conversations')).toBeOnTheScreen();
  expect(screen.queryByText('hello from claude')).toBeNull();
});
