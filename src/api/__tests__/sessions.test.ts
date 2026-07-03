// Tests the resumeSessionStream event → handler dispatch, especially the
// completion semantics: `done` is the only "finished" signal; a close
// without it means "interrupted, still running on the Mac".
import {
  enqueueResume,
  fetchMessages,
  fetchSessions,
  resumeSessionStream,
  resumeStatus,
  type StreamHandlers,
} from '../sessions';
import { apiGet, apiPost, streamSSE } from '../client';

jest.mock('../client', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  streamSSE: jest.fn(),
}));

const apiGetMock = apiGet as jest.MockedFunction<typeof apiGet>;
const apiPostMock = apiPost as jest.MockedFunction<typeof apiPost>;
const streamSSEMock = streamSSE as jest.MockedFunction<typeof streamSSE>;

function run(handlers: Partial<StreamHandlers> = {}) {
  const h: StreamHandlers = {
    onText: jest.fn(),
    onTool: jest.fn(),
    onDone: jest.fn(),
    onError: jest.fn(),
    onInterrupted: jest.fn(),
    ...handlers,
  };
  resumeSessionStream('sid', 'hello', h, []);
  const [, , onEvent, onEnd] = streamSSEMock.mock.calls[0];
  return { h, onEvent, onEnd };
}

beforeEach(() => streamSSEMock.mockClear());

it('dispatches text chunks and tool steps', () => {
  const { h, onEvent } = run();
  onEvent('text', { chunk: 'he' });
  onEvent('text', { chunk: 'y' });
  onEvent('tool', { name: 'Edit', label: 'Edit(a.ts)', stat: '+1 -1' });
  expect(h.onText).toHaveBeenNthCalledWith(1, 'he');
  expect(h.onText).toHaveBeenNthCalledWith(2, 'y');
  expect(h.onTool).toHaveBeenCalledWith({ name: 'Edit', label: 'Edit(a.ts)', stat: '+1 -1' });
});

it('a clean close after done does NOT also fire onInterrupted', () => {
  const { h, onEvent, onEnd } = run();
  onEvent('done', {});
  onEnd(undefined);
  expect(h.onDone).toHaveBeenCalledTimes(1);
  expect(h.onInterrupted).not.toHaveBeenCalled();
  expect(h.onError).not.toHaveBeenCalled();
});

it('a close WITHOUT done fires onInterrupted (turn still running)', () => {
  const { h, onEnd } = run();
  onEnd(undefined);
  expect(h.onInterrupted).toHaveBeenCalledTimes(1);
  expect(h.onDone).not.toHaveBeenCalled();
});

it('a transport error close fires onError, not onInterrupted', () => {
  const { h, onEnd } = run();
  onEnd('Bridge returned 502.');
  expect(h.onError).toHaveBeenCalledWith('Bridge returned 502.');
  expect(h.onInterrupted).not.toHaveBeenCalled();
});

it('a bridge error event suppresses the trailing onEnd delivery', () => {
  const { h, onEvent, onEnd } = run();
  onEvent('error', { message: 'session is live in a terminal' });
  onEnd(undefined);
  expect(h.onError).toHaveBeenCalledTimes(1);
  expect(h.onInterrupted).not.toHaveBeenCalled();
});

// URL and body construction — pins the wire contract with the bridge.
describe('endpoint wrappers', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
  });

  it('fetchSessions unwraps the sessions array', async () => {
    apiGetMock.mockResolvedValue({ sessions: [{ session_id: 'a' }] });
    await expect(fetchSessions()).resolves.toEqual([{ session_id: 'a' }]);
    expect(apiGetMock).toHaveBeenCalledWith('/sessions?limit=100');
  });

  it('fetchMessages omits before on the first page and includes it after', async () => {
    apiGetMock.mockResolvedValue({});
    await fetchMessages('sid');
    expect(apiGetMock).toHaveBeenCalledWith('/sessions/sid/messages?limit=50');

    await fetchMessages('sid', 42, 25);
    expect(apiGetMock).toHaveBeenCalledWith('/sessions/sid/messages?limit=25&before=42');
  });

  it('resumeStatus hits the status endpoint', async () => {
    apiGetMock.mockResolvedValue({});
    await resumeStatus('sid');
    expect(apiGetMock).toHaveBeenCalledWith('/sessions/sid/resume/status');
  });

  it('enqueueResume posts the message with its images', async () => {
    apiPostMock.mockResolvedValue({ ok: true });
    const images = [{ media_type: 'image/jpeg', data: 'b64' }];
    await enqueueResume('sid', 'queued msg', images);
    expect(apiPostMock).toHaveBeenCalledWith('/sessions/sid/resume/queue', {
      message: 'queued msg',
      images,
      files: [],
    });
  });

  it('resumeSessionStream opens the stream endpoint with message and images', () => {
    resumeSessionStream('sid', 'go', {
      onText: jest.fn(),
      onTool: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
      onInterrupted: jest.fn(),
    });
    expect(streamSSEMock).toHaveBeenCalledWith(
      '/sessions/sid/resume/stream',
      { message: 'go', images: [], files: [] },
      expect.any(Function),
      expect.any(Function),
    );
  });
});

it('missing payload fields fall back to safe defaults', () => {
  const { h, onEvent } = run();
  onEvent('text', {}); // no chunk
  onEvent('tool', {}); // no name/label/stat
  onEvent('error', {}); // no message
  expect(h.onText).toHaveBeenCalledWith('');
  expect(h.onTool).toHaveBeenCalledWith({ name: '', label: '', stat: null });
  expect(h.onError).toHaveBeenCalledWith('stream error');
});
