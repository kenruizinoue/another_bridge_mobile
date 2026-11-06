// 1.9.0: sending into the running turn ("now"), Stop, and the queued
// message actions, with the API module mocked at the seam.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import useChatSession, { mergeSteers } from '../useChatSession';
import * as api from '../../api/sessions';
import type { MessagesPage } from '../../api/types';

jest.mock('../../api/sessions', () => ({
  attachResumeStream: jest.fn(() => () => {}),
  enqueueResume: jest.fn(),
  fetchMessages: jest.fn(),
  releaseQueue: jest.fn(),
  resumeSessionStream: jest.fn(() => () => {}),
  resumeStatus: jest.fn(),
  injectMessage: jest.fn(),
  stopTurn: jest.fn(),
  runQueue: jest.fn(),
  sendQueuedNow: jest.fn(),
  sendAllQueuedNow: jest.fn(),
  deleteQueued: jest.fn(),
  restoreQueued: jest.fn(),
  editQueued: jest.fn(),
}));

const m = api as jest.Mocked<typeof api>;
const empty: MessagesPage = { messages: [], total: 0, has_more: false, next_before: null };
const running = {
  running: true,
  started_at: 1,
  queued: [] as string[],
  queue_count: 0,
  can_inject: true,
  queue_items: [] as api.QueueItem[],
  steers: [] as { id: string; text: string; state: 'sent' | 'read' }[],
  paused: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  m.fetchMessages.mockResolvedValue(empty);
});

async function openRunning(status: Partial<typeof running> = {}) {
  m.resumeStatus.mockResolvedValue({ ...running, ...status });
  const hook = await renderHook(() => useChatSession('sid'));
  await waitFor(() => expect(hook.result.current.canInject).toBe(status.can_inject ?? true));
  return hook;
}

describe('mergeSteers', () => {
  it('keeps the bridge view and local messages still sending', () => {
    const local = [
      { id: 'a', text: 'one', state: 'sent' as const },
      { id: 'tmp', text: 'two', state: 'sending' as const },
    ];
    expect(mergeSteers(local, [{ id: 'a', text: 'one', state: 'read' }], true)).toEqual([
      { id: 'a', text: 'one', state: 'read' },
      { id: 'tmp', text: 'two', state: 'sending' },
    ]);
  });

  it('empties once no turn runs (they are in the transcript)', () => {
    expect(mergeSteers([{ id: 'a', text: 'x', state: 'sent' }], [], false)).toEqual([]);
  });
});

it('"now" sends into the running turn and shows it as sent', async () => {
  const { result, unmount } = await openRunning();
  m.injectMessage.mockResolvedValue({ ok: true, status: 'sent_mid_turn', id: 's1' });
  await act(async () => {
    await result.current.send('also skip android', [], [], jest.fn(), { mode: 'now' });
  });
  expect(m.injectMessage).toHaveBeenCalledWith('sid', 'also skip android', [], []);
  expect(m.enqueueResume).not.toHaveBeenCalled();
  expect(result.current.steers).toEqual([{ id: 's1', text: 'also skip android', state: 'sent' }]);
  await unmount();
});

it('"now" falls back to the queue when the turn cannot take it', async () => {
  const { result, unmount } = await openRunning();
  m.injectMessage.mockRejectedValue(new Error('the turn just ended'));
  m.enqueueResume.mockResolvedValue({ ok: true, session_id: 'sid', queued: 1 });
  await act(async () => {
    await result.current.send('late', [], [], jest.fn(), { mode: 'now' });
  });
  expect(m.enqueueResume).toHaveBeenCalledWith('sid', 'late', [], [], false);
  expect(result.current.notice).toMatch(/queued as the next message/);
  expect(result.current.steers).toEqual([]);
  await unmount();
});

it('"after" queues even when the turn could take it', async () => {
  const { result, unmount } = await openRunning();
  m.enqueueResume.mockResolvedValue({ ok: true, session_id: 'sid', queued: 1 });
  await act(async () => {
    await result.current.send('later', [], [], jest.fn(), { mode: 'after' });
  });
  expect(m.injectMessage).not.toHaveBeenCalled();
  expect(m.enqueueResume).toHaveBeenCalled();
  await unmount();
});

it('stop, send now, delete with undo and edit call the bridge', async () => {
  const item = { id: 'q1', preview: 'deploy', text: 'deploy' };
  const { result, unmount } = await openRunning({ queued: ['deploy'], queue_count: 1, queue_items: [item] });
  await waitFor(() => expect(result.current.queueItems).toEqual([item]));

  m.stopTurn.mockResolvedValue({ stopped: true, paused: true });
  await act(async () => {
    await result.current.stop();
  });
  expect(m.stopTurn).toHaveBeenCalledWith('sid');

  m.sendQueuedNow.mockResolvedValue({ status: 'sent_mid_turn' });
  await act(async () => {
    await result.current.sendNow('q1');
  });
  expect(m.sendQueuedNow).toHaveBeenCalledWith('sid', 'q1');

  m.deleteQueued.mockResolvedValue({ removed: 'q1', position: 0 });
  await act(async () => {
    await result.current.deleteQueued('q1');
  });
  expect(m.deleteQueued).toHaveBeenCalledWith('sid', 'q1');
  expect(result.current.lastDeleted).toEqual(item);
  m.restoreQueued.mockResolvedValue({ restored: 'q1' });
  await act(async () => {
    await result.current.undoDelete();
  });
  expect(m.restoreQueued).toHaveBeenCalledWith('sid', 'q1');
  expect(result.current.lastDeleted).toBeNull();

  m.editQueued.mockResolvedValue({ id: 'q1' });
  await act(async () => {
    await result.current.editQueued('q1', '  deploy to prod ');
  });
  expect(m.editQueued).toHaveBeenCalledWith('sid', 'q1', 'deploy to prod');
  await unmount();
});

it('shows a bridge error from a queue action', async () => {
  const { result, unmount } = await openRunning();
  m.sendQueuedNow.mockRejectedValue(new Error('that message is not in the queue any more'));
  await act(async () => {
    await result.current.sendNow('gone');
  });
  expect(result.current.sendError).toBe('that message is not in the queue any more');
  await unmount();
});
