// Unit tests for the HTTP + SSE layer. The module reads EXPO_PUBLIC_*
// at import time, so each block sets env first and re-imports fresh.

type ClientModule = typeof import('../client');

function loadClient(env: Record<string, string | undefined>): ClientModule {
  jest.resetModules();
  process.env.EXPO_PUBLIC_BRIDGE_URL = env.url ?? 'http://bridge.test';
  // assigning undefined to process.env coerces to the string "undefined"
  if (env.key === undefined) delete process.env.EXPO_PUBLIC_CODER_KEY;
  else process.env.EXPO_PUBLIC_CODER_KEY = env.key;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../client');
}

// A controllable XMLHttpRequest double. Tests drive it by appending to
// `responseText` and firing onprogress/onload, mirroring how RN's XHR
// delivers SSE chunks.
class FakeXHR {
  static instances: FakeXHR[] = [];
  method = '';
  url = '';
  status = 200;
  responseText = '';
  headers: Record<string, string> = {};
  sentBody: string | null = null;
  aborted = false;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: string) {
    this.sentBody = body;
  }
  abort() {
    this.aborted = true;
  }

  // test helpers
  push(chunk: string) {
    this.responseText += chunk;
    this.onprogress?.();
  }
  finish(status = 200) {
    this.status = status;
    this.onload?.();
  }
}

beforeEach(() => {
  FakeXHR.instances = [];
  (globalThis as any).XMLHttpRequest = FakeXHR;
});

describe('apiGet / apiPost', () => {
  it('throws a setup hint when the key is missing', async () => {
    const client = loadClient({ key: undefined });
    await expect(client.apiGet('/sessions')).rejects.toThrow(/EXPO_PUBLIC_CODER_KEY/);
  });

  it('sends the auth header and parses JSON', async () => {
    const client = loadClient({ key: 'k1' });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hello: 'world' }),
    });
    (globalThis as any).fetch = fetchMock;

    await expect(client.apiGet('/sessions')).resolves.toEqual({ hello: 'world' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://bridge.test/sessions');
    expect(init.headers['X-Coder-Key']).toBe('k1');
  });

  it('apiPost sends JSON with the content-type set', async () => {
    const client = loadClient({ key: 'k1' });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    (globalThis as any).fetch = fetchMock;

    await client.apiPost('/sessions/sid/resume/queue', { message: 'hi' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://bridge.test/sessions/sid/resume/queue');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Coder-Key']).toBe('k1');
    expect(JSON.parse(init.body)).toEqual({ message: 'hi' });
  });

  it('maps 404 to a not-found message', async () => {
    const client = loadClient({ key: 'k1' });
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    await expect(client.apiGet('/x')).rejects.toThrow('Not found on the bridge.');
  });

  it('maps 401 to a key-mismatch message', async () => {
    const client = loadClient({ key: 'k1' });
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await expect(client.apiGet('/x')).rejects.toThrow(/does not match/);
  });

  it('prefers the FastAPI detail string on other errors', async () => {
    const client = loadClient({ key: 'k1' });
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: 'session is live in a terminal' }),
    });
    await expect(client.apiGet('/x')).rejects.toThrow('session is live in a terminal');
  });

  it('maps network failure to a reachability message', async () => {
    const client = loadClient({ key: 'k1' });
    (globalThis as any).fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(client.apiGet('/x')).rejects.toThrow(/Can't reach the bridge/);
  });
});

describe('streamSSE', () => {
  it('parses frames split across chunks and dispatches events', () => {
    const client = loadClient({ key: 'k1' });
    const events: Array<[string, any]> = [];
    const onEnd = jest.fn();
    client.streamSSE('/s', { m: 1 }, (ev, data) => events.push([ev, data]), onEnd);

    const xhr = FakeXHR.instances[0];
    expect(xhr.method).toBe('POST');
    expect(xhr.headers['X-Coder-Key']).toBe('k1');

    // one frame delivered in two chunks + a second complete frame
    xhr.push('event: text\ndata: {"chu');
    expect(events).toHaveLength(0); // incomplete frame → nothing yet
    xhr.push('nk":"hi"}\n\nevent: done\ndata: {}\n\n');
    xhr.finish();

    expect(events).toEqual([
      ['text', { chunk: 'hi' }],
      ['done', {}],
    ]);
    expect(onEnd).toHaveBeenCalledWith(undefined);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('skips malformed frames without ending the stream', () => {
    const client = loadClient({ key: 'k1' });
    const events: Array<[string, any]> = [];
    client.streamSSE('/s', {}, (ev, data) => events.push([ev, data]), jest.fn());

    const xhr = FakeXHR.instances[0];
    xhr.push('event: text\ndata: {not json}\n\nevent: text\ndata: {"chunk":"ok"}\n\n');
    expect(events).toEqual([['text', { chunk: 'ok' }]]);
  });

  it('reports HTTP errors through onEnd', () => {
    const client = loadClient({ key: 'k1' });
    const onEnd = jest.fn();
    client.streamSSE('/s', {}, jest.fn(), onEnd);
    FakeXHR.instances[0].finish(401);
    expect(onEnd).toHaveBeenCalledWith(expect.stringMatching(/401/));
  });

  it('fails fast without a key and never opens a request', () => {
    const client = loadClient({ key: 'replace-with-your-bridge-api-key' });
    const onEnd = jest.fn();
    client.streamSSE('/s', {}, jest.fn(), onEnd);
    expect(onEnd).toHaveBeenCalledWith(expect.stringMatching(/EXPO_PUBLIC_CODER_KEY/));
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it('returns a cancel function that aborts the request', () => {
    const client = loadClient({ key: 'k1' });
    const cancel = client.streamSSE('/s', {}, jest.fn(), jest.fn());
    cancel();
    expect(FakeXHR.instances[0].aborted).toBe(true);
  });
});
