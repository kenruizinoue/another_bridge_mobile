// Base HTTP client: config from EXPO_PUBLIC_* env (see .env.local), the
// shared X-Coder-Key auth header, and one place that maps transport /
// status failures to friendly Error messages. Endpoint modules build on
// apiGet / apiPost rather than calling fetch directly.

export const BRIDGE_URL = process.env.EXPO_PUBLIC_BRIDGE_URL ?? 'http://localhost:8000';
const CODER_KEY = process.env.EXPO_PUBLIC_CODER_KEY ?? '';

function ensureConfigured(): void {
  if (!CODER_KEY || CODER_KEY.startsWith('replace-with')) {
    throw new Error('Set EXPO_PUBLIC_CODER_KEY in .env.local, then restart Expo.');
  }
}

// Turn a non-OK response into an Error, preferring the bridge's own
// `detail` string (FastAPI's HTTPException shape) over a bare status.
async function toError(res: Response): Promise<Error> {
  // Prefer the bridge's own `detail` string (FastAPI HTTPException) so
  // precise messages like "session is live in a terminal" reach the user.
  let detail = '';
  try {
    const body = await res.json();
    if (body?.detail) detail = String(body.detail);
  } catch {
    // no JSON body; fall back to status-based messages
  }
  if (res.status === 401) return new Error('401 Unauthorized — EXPO_PUBLIC_CODER_KEY does not match the bridge.');
  if (detail) return new Error(detail);
  if (res.status === 404) return new Error('Not found on the bridge.');
  return new Error(`Bridge returned ${res.status}.`);
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  ensureConfigured();
  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}${path}`, {
      ...init,
      headers: {
        'X-Coder-Key': CODER_KEY,
        // Skip ngrok's free-tier browser-warning interstitial so API
        // calls get JSON, not HTML. Harmless on LAN / Tailscale / direct.
        'ngrok-skip-browser-warning': 'true',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`Can't reach the bridge at ${BRIDGE_URL}. Is uvicorn running?`);
  }
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return send<T>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return send<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Streaming POST that parses Server-Sent Events incrementally. RN's
// default fetch buffers the whole body, so we use XMLHttpRequest, whose
// `onprogress` delivers `responseText` as chunks arrive — reliable on
// both platforms and dependency-free (no expo/fetch, no TextDecoder).
// `onEvent(type, data)` fires per SSE frame; `onEnd(err?)` fires once at
// completion (err set on transport/status failure). Returns a cancel fn.
export function streamSSE(
  path: string,
  body: unknown,
  onEvent: (event: string, data: any) => void,
  onEnd: (err?: string) => void,
): () => void {
  if (!CODER_KEY || CODER_KEY.startsWith('replace-with')) {
    onEnd('Set EXPO_PUBLIC_CODER_KEY in .env.local, then restart Expo.');
    return () => {};
  }

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${BRIDGE_URL}${path}`);
  xhr.setRequestHeader('X-Coder-Key', CODER_KEY);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('ngrok-skip-browser-warning', 'true');

  let seen = 0; // chars of responseText already consumed
  let buffer = '';
  let ended = false;
  const end = (err?: string) => {
    if (!ended) {
      ended = true;
      onEnd(err);
    }
  };

  const pump = () => {
    const text = xhr.responseText || '';
    buffer += text.slice(seen);
    seen = text.length;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let ev = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent(ev, JSON.parse(data));
      } catch {
        // ignore a malformed frame
      }
    }
  };

  xhr.onprogress = pump;
  xhr.onload = () => {
    if (xhr.status >= 400) {
      end(xhr.status === 401 ? '401 Unauthorized — key mismatch.' : `Bridge returned ${xhr.status}.`);
      return;
    }
    pump();
    end();
  };
  xhr.onerror = () => end(`Can't reach the bridge at ${BRIDGE_URL}. Is it running?`);
  xhr.send(JSON.stringify(body));

  return () => {
    try {
      xhr.abort();
    } catch {
      // already finished
    }
  };
}
