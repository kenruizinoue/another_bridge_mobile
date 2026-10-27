// Integration tests for the conversation state machine, with the API
// module mocked at the seam (../../api/sessions). Exercises the real
// hook logic: initial load, live streaming, the busy → queue path, and
// rollback when a send fails before producing a turn.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import useChatSession from '../useChatSession';
import {
  attachResumeStream,
  enqueueResume,
  fetchMessages,
  releaseQueue,
  resumeSessionStream,
  resumeStatus,
  type AttachHandlers,
  type StreamHandlers,
} from '../../api/sessions';
import type { MessagesPage, Turn } from '../../api/types';

jest.mock('../../api/sessions', () => ({
  attachResumeStream: jest.fn(),
  enqueueResume: jest.fn(),
  fetchMessages: jest.fn(),
  releaseQueue: jest.fn(),
  resumeSessionStream: jest.fn(),
  resumeStatus: jest.fn(),
}));

const fetchMessagesMock = fetchMessages as jest.MockedFunction<typeof fetchMessages>;
const resumeStatusMock = resumeStatus as jest.MockedFunction<typeof resumeStatus>;
const enqueueResumeMock = enqueueResume as jest.MockedFunction<typeof enqueueResume>;
const streamMock = resumeSessionStream as jest.MockedFunction<typeof resumeSessionStream>;
const attachMock = attachResumeStream as jest.MockedFunction<typeof attachResumeStream>;
const releaseQueueMock = releaseQueue as jest.MockedFunction<typeof releaseQueue>;

// The handlers of the most recent attach, so a test can stream into it.
const lastAttach = (): AttachHandlers => attachMock.mock.calls[attachMock.mock.calls.length - 1][1];

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

const idleStatus = { running: false, started_at: null, queued: [], queue_count: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  resumeStatusMock.mockResolvedValue(idleStatus);
  streamMock.mockReturnValue(() => {});
  attachMock.mockReturnValue(() => {});
});

it('loads the latest page on mount', async () => {
  fetchMessagesMock.mockResolvedValue(page([turn(1, 'assistant', 'hi there')]));
  const { result } = await renderHook(() => useChatSession('sid'));

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.turns.map((t) => t.text)).toEqual(['hi there']);
  expect(result.current.error).toBeNull();
});

it('surfaces the load error on mount failure', async () => {
  fetchMessagesMock.mockRejectedValue(new Error('Can’t reach the bridge'));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toMatch(/reach the bridge/);
});

it('streams a live send: optimistic turn, chunks, done → canonical refresh', async () => {
  fetchMessagesMock.mockResolvedValue(page([turn(1, 'assistant', 'earlier reply')]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let handlers!: StreamHandlers;
  streamMock.mockImplementation((_sid, _msg, h) => {
    handlers = h;
    return () => {};
  });

  const restore = jest.fn();
  await act(async () => {
    await result.current.send('do the thing', [], [], restore);
  });

  // optimistic user turn at the bottom (index 0 of the inverted list)
  expect(result.current.sending).toBe(true);
  expect(result.current.turns[0]).toMatchObject({ index: -1, role: 'user', text: 'do the thing' });

  await act(async () => {
    handlers.onText('work');
    handlers.onText('ing');
  });
  expect(result.current.streamText).toBe('working');

  // done → catch-up refetches the canonical transcript
  fetchMessagesMock.mockResolvedValue(
    page([turn(3, 'assistant', 'all done'), turn(2, 'user', 'do the thing')]),
  );
  await act(async () => {
    await handlers.onDone();
  });

  await waitFor(() => expect(result.current.sending).toBe(false));
  expect(result.current.streamText).toBe('');
  expect(result.current.turns[0].text).toBe('all done');
  expect(restore).not.toHaveBeenCalled();
});

it('rolls back and surfaces the error when the stream fails to start', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let handlers!: StreamHandlers;
  streamMock.mockImplementation((_sid, _msg, h) => {
    handlers = h;
    return () => {};
  });

  const restore = jest.fn();
  await act(async () => {
    await result.current.send('lost message?', [], [], restore);
  });
  await act(async () => handlers.onError('401 Unauthorized — key mismatch.'));

  expect(restore).toHaveBeenCalledTimes(1); // message handed back to composer
  expect(result.current.sending).toBe(false);
  expect(result.current.turns).toHaveLength(0); // optimistic turn removed
  expect(result.current.sendError).toMatch(/401/);
});

it('queues server-side when a turn is already running', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  // first send → live stream, hook is now busy
  streamMock.mockReturnValue(() => {});
  await act(async () => {
    await result.current.send('first', [], [], jest.fn());
  });
  expect(result.current.sending).toBe(true);

  // second send while busy → queued server-side, not streamed
  enqueueResumeMock.mockResolvedValue({ ok: true, session_id: 'sid', queued: 1 });
  resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true, queued: ['second'], queue_count: 1 });
  await act(async () => {
    await result.current.send('second', [], [], jest.fn());
  });

  expect(enqueueResumeMock).toHaveBeenCalledWith('sid', 'second', [], [], false);
  expect(streamMock).toHaveBeenCalledTimes(1); // no second live stream
  await waitFor(() => expect(result.current.queued).toContain('second'));
  expect(result.current.syncing).toBe(true);

  await unmount(); // clears the catch-up backoff timer
});

it('passes images through to the stream and previews image-only sends', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const images = [{ media_type: 'image/jpeg', data: 'b64data' }];
  await act(async () => {
    await result.current.send('', images, [], jest.fn());
  });

  // images reach the wire call, and the optimistic turn shows a preview
  expect(streamMock).toHaveBeenCalledWith('sid', '', expect.anything(), images, [], false);
  expect(result.current.turns[0].text).toBe('📎 1 attachment(s)');
});

it('a completely empty send is a no-op', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.send('', [], [], jest.fn());
  });
  expect(streamMock).not.toHaveBeenCalled();
  expect(result.current.sending).toBe(false);
});

it('a failed manual refresh keeps the turns on screen without an error', async () => {
  fetchMessagesMock.mockResolvedValue(page([turn(1, 'assistant', 'still here')]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  fetchMessagesMock.mockRejectedValue(new Error('offline'));
  await act(async () => {
    await result.current.refresh();
  });

  expect(result.current.turns[0].text).toBe('still here'); // not wiped
  expect(result.current.error).toBeNull(); // no full-screen error state
  expect(result.current.refreshing).toBe(false); // spinner released
});

it('pages older turns in with loadOlder, keeping newest-first order', async () => {
  fetchMessagesMock.mockResolvedValue({
    messages: [turn(4, 'assistant', 'newest'), turn(3, 'user', 'recent')],
    total: 4,
    has_more: true,
    next_before: 3,
  });
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.hasMore).toBe(true);

  fetchMessagesMock.mockResolvedValue({
    messages: [turn(2, 'assistant', 'older'), turn(1, 'user', 'oldest')],
    total: 4,
    has_more: false,
    next_before: null,
  });
  await act(async () => {
    await result.current.loadOlder();
  });

  expect(fetchMessagesMock).toHaveBeenLastCalledWith('sid', 3);
  expect(result.current.turns.map((t) => t.text)).toEqual(['newest', 'recent', 'older', 'oldest']);
  expect(result.current.hasMore).toBe(false);

  // exhausted → further calls don't refetch
  fetchMessagesMock.mockClear();
  await act(async () => {
    await result.current.loadOlder();
  });
  expect(fetchMessagesMock).not.toHaveBeenCalled();
});

it('reopening a chat mid-turn attaches and streams the rest live', async () => {
  fetchMessagesMock.mockResolvedValue(page([turn(1, 'user', 'sent from phone')]));
  resumeStatusMock.mockResolvedValue({ running: true, started_at: 123, queued: ['follow-up'], queue_count: 1 });
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  // the app left the chat (or was killed) mid-turn: reopening attaches
  await waitFor(() => expect(attachMock).toHaveBeenCalledWith('sid', expect.anything()));
  expect(result.current.syncing).toBe(true);
  expect(result.current.live).toBe(true);
  expect(result.current.queued).toEqual(['follow-up']);

  await act(async () => {
    lastAttach().onText('still ');
    lastAttach().onText('going');
    lastAttach().onTool({ name: 'Bash', label: 'Bash: run tests', stat: null });
  });
  expect(result.current.streamText).toBe('still going');
  expect(result.current.streamTools).toHaveLength(1);

  // the turn and the queue finish on the Mac
  resumeStatusMock.mockResolvedValue(idleStatus);
  fetchMessagesMock.mockResolvedValue(page([turn(2, 'assistant', 'the reply'), turn(1, 'user', 'sent from phone')]));
  await act(async () => {
    lastAttach().onDone();
  });

  await waitFor(() => expect(result.current.syncing).toBe(false));
  expect(result.current.live).toBe(false);
  expect(result.current.streamText).toBe('');
  expect(result.current.turns[0].text).toBe('the reply');
  expect(result.current.queued).toEqual([]);
  await unmount();
});

it('an interrupted stream attaches to the rest of the turn instead of erroring', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let handlers!: StreamHandlers;
  streamMock.mockImplementation((_sid, _msg, h) => {
    handlers = h;
    return () => {};
  });
  const restore = jest.fn();
  await act(async () => {
    await result.current.send('long task', [], [], restore);
  });

  // connection drops mid-stream, but the Mac is still working
  resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true });
  fetchMessagesMock.mockResolvedValue(page([turn(1, 'user', 'long task')]));
  await act(async () => {
    handlers.onInterrupted();
  });

  await waitFor(() => expect(attachMock).toHaveBeenCalledTimes(1));
  expect(result.current.syncing).toBe(true);
  expect(result.current.sending).toBe(false);
  expect(result.current.sendError).toBeNull();
  expect(restore).not.toHaveBeenCalled(); // never rolled back

  resumeStatusMock.mockResolvedValue(idleStatus);
  fetchMessagesMock.mockResolvedValue(page([turn(2, 'assistant', 'finished anyway'), turn(1, 'user', 'long task')]));
  await act(async () => {
    lastAttach().onDone();
  });
  await waitFor(() => expect(result.current.syncing).toBe(false));
  expect(result.current.turns[0].text).toBe('finished anyway');
  await unmount();
});

it('falls back to polling when the bridge has no attach endpoint', async () => {
  jest.useFakeTimers();
  try {
    fetchMessagesMock.mockResolvedValue(page([]));
    resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true });
    const { result, unmount } = await renderHook(() => useChatSession('sid'));
    await waitFor(() => expect(attachMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      lastAttach().onDropped(404); // an older bridge
    });

    // the next pass polls instead of attaching again
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(resumeStatusMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(attachMock).toHaveBeenCalledTimes(1);
    expect(result.current.live).toBe(false);
    expect(result.current.syncing).toBe(true);

    resumeStatusMock.mockResolvedValue(idleStatus);
    fetchMessagesMock.mockResolvedValue(page([turn(1, 'assistant', 'done by polling')]));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.turns[0].text).toBe('done by polling');
    await unmount();
  } finally {
    jest.useRealTimers();
  }
});

it('a dropped attach re-attaches on the next pass', async () => {
  jest.useFakeTimers();
  try {
    fetchMessagesMock.mockResolvedValue(page([]));
    resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true });
    const { unmount } = await renderHook(() => useChatSession('sid'));
    await waitFor(() => expect(attachMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      lastAttach().onDropped(); // cellular blip
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(attachMock).toHaveBeenCalledTimes(2));
    await unmount();
  } finally {
    jest.useRealTimers();
  }
});

it('restores the message when server-side enqueue fails', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  streamMock.mockReturnValue(() => {});
  await act(async () => {
    await result.current.send('first', [], [], jest.fn());
  });

  enqueueResumeMock.mockRejectedValue(new Error('Bridge returned 500.'));
  const restore = jest.fn();
  await act(async () => {
    await result.current.send('second', [], [], restore);
  });

  expect(restore).toHaveBeenCalledTimes(1);
  expect(result.current.queued).not.toContain('second'); // optimistic entry rolled back
  expect(result.current.sendError).toMatch(/500/);
});

it('a failed catch-up retries with backoff until the bridge answers', async () => {
  jest.useFakeTimers();
  try {
    fetchMessagesMock.mockResolvedValue(page([]));
    const { result, unmount } = await renderHook(() => useChatSession('sid'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let handlers!: StreamHandlers;
    streamMock.mockImplementation((_sid, _msg, h) => {
      handlers = h;
      return () => {};
    });
    await act(async () => {
      await result.current.send('task', [], [], jest.fn());
    });

    // the stream drops while the Mac is offline (ngrok reconnecting)
    resumeStatusMock.mockRejectedValue(new Error('offline'));
    await act(async () => {
      handlers.onInterrupted();
    });
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.sendError).toBeNull();

    // it keeps retrying instead of sticking (the old bug)
    resumeStatusMock.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(resumeStatusMock).toHaveBeenCalledTimes(1);

    // the Mac is back and the turn already finished
    resumeStatusMock.mockResolvedValue(idleStatus);
    fetchMessagesMock.mockResolvedValue(page([turn(2, 'assistant', 'landed'), turn(1, 'user', 'task')]));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.offline).toBe(false);
    expect(result.current.sending).toBe(false);
    expect(result.current.turns[0].text).toBe('landed');
    await unmount();
  } finally {
    jest.useRealTimers();
  }
});

it('leaving the chat closes the streams and stops catch-up', async () => {
  jest.useFakeTimers();
  try {
    const cancelSend = jest.fn();
    const cancelAttach = jest.fn();
    fetchMessagesMock.mockResolvedValue(page([]));
    const { result, unmount } = await renderHook(() => useChatSession('sid'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    streamMock.mockReturnValue(cancelSend);
    await act(async () => {
      await result.current.send('task', [], [], jest.fn());
    });
    await unmount();
    expect(cancelSend).toHaveBeenCalledTimes(1);

    // a chat left while attached closes the attach too
    attachMock.mockReturnValue(cancelAttach);
    resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true });
    const second = await renderHook(() => useChatSession('sid'));
    await waitFor(() => expect(attachMock).toHaveBeenCalled());
    await second.unmount();
    expect(cancelAttach).toHaveBeenCalled();

    resumeStatusMock.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(resumeStatusMock).not.toHaveBeenCalled(); // no zombie polling
  } finally {
    jest.useRealTimers();
  }
});

it('refresh during a turn drops the send stream and attaches fresh', async () => {
  const cancelSend = jest.fn();
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  streamMock.mockReturnValue(cancelSend);
  await act(async () => {
    await result.current.send('task', [], [], jest.fn());
  });

  resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true });
  fetchMessagesMock.mockResolvedValue(page([turn(1, 'user', 'task')]));
  await act(async () => {
    await result.current.refresh();
  });

  expect(cancelSend).toHaveBeenCalledTimes(1);
  expect(attachMock).toHaveBeenCalledTimes(1);
  expect(result.current.sending).toBe(false);
  expect(result.current.live).toBe(true);
  expect(result.current.refreshing).toBe(false);
  await unmount();
});

it('coming back to the foreground re-syncs and attaches', async () => {
  // AppState is a jest mock in this preset: take the hook's listener from it.
  const addListener = AppState.addEventListener as unknown as jest.Mock;
  const cancelSend = jest.fn();
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  streamMock.mockReturnValue(cancelSend);
  await act(async () => {
    await result.current.send('task', [], [], jest.fn());
  });

  resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true });
  const onChange = addListener.mock.calls.filter((c) => c[0] === 'change').pop()![1];
  await act(async () => {
    onChange('active');
  });
  await waitFor(() => expect(attachMock).toHaveBeenCalledTimes(1));
  expect(cancelSend).toHaveBeenCalledTimes(1); // the frozen stream is dropped
  await unmount();
});

it('catch-up keeps the older pages already loaded', async () => {
  fetchMessagesMock.mockResolvedValue({
    messages: [turn(4, 'assistant', 'newest'), turn(3, 'user', 'recent')],
    total: 4,
    has_more: true,
    next_before: 3,
  });
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  fetchMessagesMock.mockResolvedValue({
    messages: [turn(2, 'assistant', 'older'), turn(1, 'user', 'oldest')],
    total: 4,
    has_more: false,
    next_before: null,
  });
  await act(async () => {
    await result.current.loadOlder();
  });

  // a new reply lands and refresh pulls the latest page
  fetchMessagesMock.mockResolvedValue({
    messages: [turn(5, 'assistant', 'brand new'), turn(4, 'assistant', 'newest')],
    total: 5,
    has_more: true,
    next_before: 4,
  });
  await act(async () => {
    await result.current.refresh();
  });

  expect(result.current.turns.map((t) => t.text)).toEqual(['brand new', 'newest', 'recent', 'older', 'oldest']);
  expect(result.current.hasMore).toBe(false); // the loaded cursor is kept
  await unmount();
});

it('loadOlder called twice quickly fetches the page once', async () => {
  fetchMessagesMock.mockResolvedValue({
    messages: [turn(4, 'assistant', 'newest')],
    total: 4,
    has_more: true,
    next_before: 4,
  });
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  fetchMessagesMock.mockClear();
  fetchMessagesMock.mockResolvedValue({ messages: [turn(3, 'user', 'older')], total: 4, has_more: false, next_before: null });
  await act(async () => {
    await Promise.all([result.current.loadOlder(), result.current.loadOlder()]);
  });
  expect(fetchMessagesMock).toHaveBeenCalledTimes(1);
  expect(result.current.turns.map((t) => t.text)).toEqual(['newest', 'older']);
});

it('passes files through to the stream and previews attachment-only sends', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const files = [{ name: 'report.pdf', data: 'b64' }];
  await act(async () => {
    await result.current.send('', [], files, jest.fn());
  });

  expect(streamMock).toHaveBeenCalledWith('sid', '', expect.anything(), [], files, false);
  expect(result.current.turns[0].text).toBe('📎 1 attachment(s)');
});

it('queued sends carry files server-side', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  streamMock.mockReturnValue(() => {});
  await act(async () => {
    await result.current.send('first', [], [], jest.fn());
  });

  enqueueResumeMock.mockResolvedValue({ ok: true, session_id: 'sid', queued: 1 });
  resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true, queued: ['📎 1 attachment(s)'], queue_count: 1 });
  const files = [{ name: 'data.csv', data: 'b64' }];
  await act(async () => {
    await result.current.send('', [], files, jest.fn());
  });

  expect(enqueueResumeMock).toHaveBeenCalledWith('sid', '', [], files, false);
  await unmount();
});

it('voice sends pass the flag to the stream and capture the speech event', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    void result.current.send('run tests', [], [], () => {}, { voice: true });
  });

  const [, message, handlers, , , voice] = streamMock.mock.calls[0];
  expect(message).toBe('run tests');
  expect(voice).toBe(true);

  await act(async () => {
    (handlers as StreamHandlers).onSpeech?.('Done, all green.');
  });
  expect(result.current.speech).toBe('Done, all green.');
});

it('a new send clears the previous speech', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    void result.current.send('first', [], [], () => {}, { voice: true });
  });
  await act(async () => {
    (streamMock.mock.calls[0][2] as StreamHandlers).onSpeech?.('old speech');
    (streamMock.mock.calls[0][2] as StreamHandlers).onDone();
  });
  await waitFor(() => expect(result.current.sending).toBe(false));

  await act(async () => {
    void result.current.send('second', [], [], () => {});
  });
  expect(result.current.speech).toBeNull();
});

// ── A terminal tab working on the same session (1.6.0) ─────────────────

const workingTerminal = { open: true, busy: false, active: true, agents: 2 };

it('opening a session that works in a terminal tab follows its replies', async () => {
  jest.useFakeTimers();
  try {
    fetchMessagesMock.mockResolvedValue(page([turn(1, 'assistant', 'terminal reply 1')]));
    resumeStatusMock.mockResolvedValue({ ...idleStatus, terminal: workingTerminal });
    const { result, unmount } = await renderHook(() => useChatSession('sid'));
    await waitFor(() => expect(result.current.terminal).toEqual(workingTerminal));
    expect(attachMock).not.toHaveBeenCalled(); // nothing of the bridge's to attach to

    // The tab writes more; the next poll pulls it in.
    fetchMessagesMock.mockResolvedValue(page([turn(2, 'assistant', 'terminal reply 2')]));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(result.current.turns[0].text).toBe('terminal reply 2'));

    // The tab is done: polling stops.
    resumeStatusMock.mockResolvedValue(idleStatus);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(result.current.terminal).toBeNull());
    const calls = fetchMessagesMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(fetchMessagesMock.mock.calls.length).toBe(calls);
    await unmount();
  } finally {
    jest.useRealTimers();
  }
});

it('sending while the terminal tab works goes to the queue, never a second copy', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  resumeStatusMock.mockResolvedValue({ ...idleStatus, terminal: workingTerminal });
  enqueueResumeMock.mockResolvedValue({ ok: true, session_id: 'sid', queued: 1 });
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.terminal).toEqual(workingTerminal));

  await act(async () => {
    await result.current.send('still waiting?', [], [], jest.fn());
  });
  expect(enqueueResumeMock).toHaveBeenCalledWith('sid', 'still waiting?', [], [], false);
  expect(streamMock).not.toHaveBeenCalled();
  await unmount();
});

it('a stream the bridge holds moves the message from the chat to the queue', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let handlers!: StreamHandlers;
  streamMock.mockImplementation((_sid, _msg, h) => {
    handlers = h;
    return () => {};
  });
  const restore = jest.fn();
  await act(async () => {
    await result.current.send('write the script', [], [], restore);
  });
  expect(result.current.turns[0]).toMatchObject({ index: -1, text: 'write the script' });

  await act(async () => {
    handlers.onQueued?.('terminal');
  });
  expect(result.current.turns.find((t) => t.index === -1)).toBeUndefined();
  expect(result.current.queued).toEqual(['write the script']);
  expect(result.current.held).toBe('terminal');
  expect(result.current.sending).toBe(false);

  // done follows; catch-up mirrors the bridge's queue and keeps syncing
  resumeStatusMock.mockResolvedValue({
    ...idleStatus, queued: ['write the script'], queue_count: 1, held: 'terminal', terminal: workingTerminal,
  });
  await act(async () => {
    await handlers.onDone();
  });
  await waitFor(() => expect(result.current.syncing).toBe(true));
  expect(result.current.held).toBe('terminal');
  expect(restore).not.toHaveBeenCalled();
  await unmount();
});

it('Send anyway releases the held queue and syncs again', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  resumeStatusMock.mockResolvedValue({
    ...idleStatus, queued: ['go'], queue_count: 1, held: 'terminal', terminal: workingTerminal,
  });
  releaseQueueMock.mockResolvedValue({ ok: true, session_id: 'sid', released: 1 });
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.held).toBe('terminal'));

  const before = resumeStatusMock.mock.calls.length;
  resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true, terminal: workingTerminal });
  await act(async () => {
    await result.current.sendAnyway();
  });
  expect(releaseQueueMock).toHaveBeenCalledWith('sid');
  expect(resumeStatusMock.mock.calls.length).toBeGreaterThan(before);
  await waitFor(() => expect(result.current.held).toBeNull());
  await unmount();
});

it('a queue held by the cap knows which sessions it waits for, without their dates', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  resumeStatusMock.mockResolvedValue({
    ...idleStatus,
    queued: ['install'],
    queue_count: 1,
    held: 'limit',
    held_by: [
      { session_id: 'a', title: '2026/Oct/22 AnotherSystems Marketing' },
      { session_id: 'b', title: 'Kodama Marketing' },
    ],
  });
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.heldBy).toEqual(['AnotherSystems Marketing', 'Kodama Marketing']));
  expect(result.current.held).toBe('limit');
  await unmount();
});

it('a failed Send anyway shows the error', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  releaseQueueMock.mockRejectedValue(new Error('Bridge returned 404.'));
  const { result, unmount } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.sendAnyway();
  });
  expect(result.current.sendError).toBe('Bridge returned 404.');
  await unmount();
});
