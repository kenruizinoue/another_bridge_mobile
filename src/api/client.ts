// Base HTTP client: config from EXPO_PUBLIC_* env (see .env.local), the
// shared X-Coder-Key auth header, and one place that maps transport /
// status failures to friendly Error messages. Endpoint modules build on
// apiGet rather than calling fetch directly.

export const BRIDGE_URL = process.env.EXPO_PUBLIC_BRIDGE_URL ?? 'http://localhost:8000';
const CODER_KEY = process.env.EXPO_PUBLIC_CODER_KEY ?? '';

function ensureConfigured(): void {
  if (!CODER_KEY || CODER_KEY.startsWith('replace-with')) {
    throw new Error('Set EXPO_PUBLIC_CODER_KEY in .env.local, then restart Expo.');
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  ensureConfigured();

  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}${path}`, {
      headers: { 'X-Coder-Key': CODER_KEY },
    });
  } catch {
    throw new Error(`Can't reach the bridge at ${BRIDGE_URL}. Is uvicorn running?`);
  }

  if (res.status === 401) throw new Error('401 Unauthorized — EXPO_PUBLIC_CODER_KEY does not match the bridge.');
  if (res.status === 404) throw new Error('Not found on the bridge.');
  if (!res.ok) throw new Error(`Bridge returned ${res.status}.`);

  return (await res.json()) as T;
}
