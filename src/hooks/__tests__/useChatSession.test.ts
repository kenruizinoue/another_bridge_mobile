// Integration tests for the conversation state machine, with the API
// module mocked at the seam (../../api/sessions). Exercises the real
// hook logic: initial load, live streaming, the busy → queue path, and
// rollback when a send fails before producing a turn.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import useChatSession from '../useChatSession';
import {
  enqueueResume,
  fetchMessages,
  resumeSessionStream,
  resumeStatus,
  type StreamHandlers,
} from '../../api/sessions';
import type { MessagesPage, Turn } from '../../api/types';

jest.mock('../../api/sessions', () => ({
  enqueueResume: jest.fn(),
  fetchMessages: jest.fn(),
  resumeSessionStream: jest.fn(),
  resumeStatus: jest.fn(),
}));

const fetchMessagesMock = fetchMessages as jest.MockedFunction<typeof fetchMessages>;
const resumeStatusMock = resumeStatus as jest.MockedFunction<typeof resumeStatus>;
const enqueueResumeMock = enqueueResume as jest.MockedFunction<typeof enqueueResume>;
const streamMock = resumeSessionStream as jest.MockedFunction<typeof resumeSessionStream>;

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
    await result.current.send('do the thing', [], restore);
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
    await result.current.send('lost message?', [], restore);
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
    await result.current.send('first', [], jest.fn());
  });
  expect(result.current.sending).toBe(true);

  // second send while busy → queued server-side, not streamed
  enqueueResumeMock.mockResolvedValue({ ok: true, session_id: 'sid', queued: 1 });
  resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true, queued: ['second'], queue_count: 1 });
  await act(async () => {
    await result.current.send('second', [], jest.fn());
  });

  expect(enqueueResumeMock).toHaveBeenCalledWith('sid', 'second', []);
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
    await result.current.send('', images, jest.fn());
  });

  // images reach the wire call, and the optimistic turn shows a preview
  expect(streamMock).toHaveBeenCalledWith('sid', '', expect.anything(), images);
  expect(result.current.turns[0].text).toBe('📎 1 image(s)');
});

it('a completely empty send is a no-op', async () => {
  fetchMessagesMock.mockResolvedValue(page([]));
  const { result } = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.send('', [], jest.fn());
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

it('resumes syncing on mount when the bridge reports a turn still running', async () => {
  jest.useFakeTimers();
  try {
    fetchMessagesMock.mockResolvedValue(page([turn(1, 'user', 'sent from phone')]));
    resumeStatusMock.mockResolvedValue({
      running: true,
      started_at: 123,
      queued: ['follow-up'],
      queue_count: 1,
    });
    const { result, unmount } = await renderHook(() => useChatSession('sid'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // the app was killed mid-turn; on reopen the hook picks the run back up
    await waitFor(() => expect(result.current.syncing).toBe(true));
    expect(result.current.queued).toEqual(['follow-up']);

    // the run finishes on the Mac → the next poll clears everything
    resumeStatusMock.mockResolvedValue(idleStatus);
    fetchMessagesMock.mockResolvedValue(
      page([turn(2, 'assistant', 'the reply'), turn(1, 'user', 'sent from phone')]),
    );
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.turns[0].text).toBe('the reply');
    expect(result.current.queued).toEqual([]);
    await unmount();
  } finally {
    jest.useRealTimers();
  }
});

it('hands an interrupted stream to catch-up instead of erroring', async () => {
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
    const restore = jest.fn();
    await act(async () => {
      await result.current.send('long task', [], restore);
    });

    // connection drops mid-stream, but the Mac is still working
    resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true });
    await act(async () => {
      handlers.onInterrupted();
    });

    await waitFor(() => expect(result.current.syncing).toBe(true));
    expect(result.current.sendError).toBeNull();
    expect(restore).not.toHaveBeenCalled(); // never rolled back

    // the turn eventually lands in the transcript
    resumeStatusMock.mockResolvedValue(idleStatus);
    fetchMessagesMock.mockResolvedValue(
      page([turn(2, 'assistant', 'finished anyway'), turn(1, 'user', 'long task')]),
    );
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.turns[0].text).toBe('finished anyway');
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
    await result.current.send('first', [], jest.fn());
  });

  enqueueResumeMock.mockRejectedValue(new Error('Bridge returned 500.'));
  const restore = jest.fn();
  await act(async () => {
    await result.current.send('second', [], restore);
  });

  expect(restore).toHaveBeenCalledTimes(1);
  expect(result.current.queued).not.toContain('second'); // optimistic entry rolled back
  expect(result.current.sendError).toMatch(/500/);
});

it('an offline catch-up poll fails quietly and does not tight-loop', async () => {
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
      await result.current.send('task', [], jest.fn());
    });

    // enter catch-up while the Mac is busy
    resumeStatusMock.mockResolvedValue({ ...idleStatus, running: true });
    await act(async () => {
      handlers.onInterrupted();
    });
    await waitFor(() => expect(result.current.syncing).toBe(true));

    // network drops: the scheduled poll rejects → no error, no reschedule
    resumeStatusMock.mockRejectedValue(new Error('offline'));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.syncing).toBe(true); // still waiting, not broken
    expect(result.current.sendError).toBeNull();

    // no timer was rescheduled after the failure (no tight retry loop)
    resumeStatusMock.mockClear();
    resumeStatusMock.mockResolvedValue(idleStatus);
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(resumeStatusMock).not.toHaveBeenCalled();
    await unmount();
  } finally {
    jest.useRealTimers();
  }
});
