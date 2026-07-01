// Screen-level integration: real ChatScreen + real hooks + real
// components, mocked only at the API seam. Drives a full send round-trip
// through the composer UI.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ChatScreen from '../ChatScreen';
import {
  fetchMessages,
  resumeSessionStream,
  resumeStatus,
  type StreamHandlers,
} from '../../api/sessions';
import type { MessagesPage, SessionCard, Turn } from '../../api/types';

jest.mock('../../api/sessions', () => ({
  enqueueResume: jest.fn(),
  fetchMessages: jest.fn(),
  resumeSessionStream: jest.fn(),
  resumeStatus: jest.fn(),
}));
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

const ImagePicker = require('expo-image-picker');
const ImageManipulator = require('expo-image-manipulator');

const fetchMessagesMock = fetchMessages as jest.MockedFunction<typeof fetchMessages>;
const resumeStatusMock = resumeStatus as jest.MockedFunction<typeof resumeStatus>;
const streamMock = resumeSessionStream as jest.MockedFunction<typeof resumeSessionStream>;

const session: SessionCard = {
  session_id: 'sid',
  title: 'A session',
  cwd: '/repo',
  project: 'repo',
  message_count: 2,
  created_at: null,
  last_activity: Date.now() / 1000,
  size_bytes: 1,
};

const turn = (index: number, role: Turn['role'], text: string): Turn => ({
  index,
  uuid: String(index),
  role,
  text,
  tool_calls: 0,
  tools: [],
  timestamp: null,
});

const page = (messages: Turn[]): MessagesPage => ({
  messages,
  total: messages.length,
  has_more: false,
  next_before: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  resumeStatusMock.mockResolvedValue({ running: false, started_at: null, queued: [], queue_count: 0 });
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });
  ImageManipulator.manipulateAsync.mockImplementation(async (uri: string) => ({
    uri: `${uri}-small`,
    base64: `b64-of-${uri}`,
  }));
});

it('renders the transcript and the start-of-conversation marker', async () => {
  fetchMessagesMock.mockResolvedValue(
    page([turn(2, 'assistant', 'sure thing'), turn(1, 'user', 'help me')]),
  );
  await render(<ChatScreen session={session} onBack={jest.fn()} />);

  expect(await screen.findByText('sure thing')).toBeOnTheScreen();
  expect(screen.getByText('help me')).toBeOnTheScreen();
  expect(screen.getByText('— start of conversation —')).toBeOnTheScreen();
});

it('calls onBack from the header back button', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const onBack = jest.fn();
  await render(<ChatScreen session={session} onBack={onBack} />);
  await waitFor(() => expect(fetchMessagesMock).toHaveBeenCalled());

  await fireEvent.press(screen.getByTestId('chat-back'));
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('sends a typed message and shows the streaming reply until done', async () => {
  fetchMessagesMock.mockResolvedValue(page([turn(1, 'user', 'earlier')]));
  let handlers!: StreamHandlers;
  streamMock.mockImplementation((_sid, _msg, h) => {
    handlers = h;
    return () => {};
  });
  await render(<ChatScreen session={session} onBack={jest.fn()} />);
  await screen.findByText('earlier');

  await fireEvent.changeText(screen.getByTestId('composer-input'), 'run the tests');
  await fireEvent.press(screen.getByTestId('composer-send'));

  // optimistic user turn + working indicator
  expect(await screen.findByText('run the tests')).toBeOnTheScreen();
  expect(streamMock).toHaveBeenCalledWith('sid', 'run the tests', expect.anything(), []);
  expect(screen.getByText(/working on the Mac/)).toBeOnTheScreen();

  // chunks arrive → live monospace turn with cursor
  await waitFor(() => handlers.onText('they pass'));
  expect(screen.getByText(/they pass/)).toBeOnTheScreen();

  // done → canonical transcript replaces the stream
  fetchMessagesMock.mockResolvedValue(
    page([turn(3, 'assistant', 'they pass ✅'), turn(2, 'user', 'run the tests')]),
  );
  await waitFor(async () => handlers.onDone());
  expect(await screen.findByText('they pass ✅')).toBeOnTheScreen();

  // input was cleared on send
  expect(screen.getByTestId('composer-input').props.value).toBe('');
});

it('restores the draft and the attachments when a send fails to start', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  let handlers!: StreamHandlers;
  streamMock.mockImplementation((_sid, _msg, h) => {
    handlers = h;
    return () => {};
  });
  await render(<ChatScreen session={session} onBack={jest.fn()} />);
  await waitFor(() => expect(fetchMessagesMock).toHaveBeenCalled());

  // attach one image + type a message
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'pic.png' }],
  });
  await fireEvent.press(screen.getByTestId('composer-attach'));
  await screen.findByTestId('thumb-remove-pic.png-small');
  await fireEvent.changeText(screen.getByTestId('composer-input'), 'take this image');

  // send clears the composer…
  await fireEvent.press(screen.getByTestId('composer-send'));
  expect(screen.getByTestId('composer-input').props.value).toBe('');
  expect(screen.queryByTestId('thumb-remove-pic.png-small')).toBeNull();
  expect(streamMock).toHaveBeenCalledWith(
    'sid',
    'take this image',
    expect.anything(),
    [{ media_type: 'image/jpeg', data: 'b64-of-pic.png' }],
  );

  // …and a failure hands everything back: text, thumbnail, and the error
  await waitFor(async () => handlers.onError('401 Unauthorized — key mismatch.'));
  expect(screen.getByTestId('composer-input').props.value).toBe('take this image');
  expect(await screen.findByTestId('thumb-remove-pic.png-small')).toBeOnTheScreen();
  expect(screen.getByText(/✕ 401 Unauthorized/)).toBeOnTheScreen();
});

it('shows the photo-permission hint and clears it on the next pick attempt', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  await render(<ChatScreen session={session} onBack={jest.fn()} />);
  await waitFor(() => expect(fetchMessagesMock).toHaveBeenCalled());

  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
  await fireEvent.press(screen.getByTestId('composer-attach'));
  expect(await screen.findByText(/Photo access is off/)).toBeOnTheScreen();

  // permission granted in Settings → the retry clears the stale hint
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'ok.png' }],
  });
  await fireEvent.press(screen.getByTestId('composer-attach'));
  await screen.findByTestId('thumb-remove-ok.png-small');
  expect(screen.queryByText(/Photo access is off/)).toBeNull();
});

it('loads the older page when the inverted list reaches its end', async () => {
  fetchMessagesMock.mockResolvedValue({
    messages: [turn(3, 'assistant', 'newest reply')],
    total: 3,
    has_more: true,
    next_before: 3,
  });
  await render(<ChatScreen session={session} onBack={jest.fn()} />);
  await screen.findByText('newest reply');

  fetchMessagesMock.mockResolvedValue({
    messages: [turn(2, 'assistant', 'older reply'), turn(1, 'user', 'first message')],
    total: 3,
    has_more: false,
    next_before: null,
  });
  await fireEvent(screen.getByTestId('chat-list'), 'onEndReached');

  expect(await screen.findByText('older reply')).toBeOnTheScreen();
  expect(screen.getByText('first message')).toBeOnTheScreen();
  expect(fetchMessagesMock).toHaveBeenLastCalledWith('sid', 3);
  // fully paged → the start marker appears
  expect(screen.getByText('— start of conversation —')).toBeOnTheScreen();
});
