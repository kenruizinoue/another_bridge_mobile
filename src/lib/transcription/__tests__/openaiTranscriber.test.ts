import { openaiTranscriber } from '../openaiTranscriber';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.EXPO_PUBLIC_OPENAI_API_KEY;
});

it('is unavailable without a key', async () => {
  expect(await openaiTranscriber.isAvailable()).toBe(false);
  expect(await openaiTranscriber.transcribe('file://a.wav')).toBeNull();
});

it('posts the file and returns the text', async () => {
  process.env.EXPO_PUBLIC_OPENAI_API_KEY = 'sk-test';
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ text: '  hello world  ' }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  expect(await openaiTranscriber.isAvailable()).toBe(true);
  expect(await openaiTranscriber.transcribe('file://a.wav')).toBe('hello world');

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
});

it('returns null on HTTP errors and network failures', async () => {
  process.env.EXPO_PUBLIC_OPENAI_API_KEY = 'sk-test';

  globalThis.fetch = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;
  expect(await openaiTranscriber.transcribe('file://a.wav')).toBeNull();

  globalThis.fetch = jest.fn(async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  expect(await openaiTranscriber.transcribe('file://a.wav')).toBeNull();
});
