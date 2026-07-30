import { createBridgeSynthesizer, createOpenAiSynthesizer } from '../synthesizers';

jest.mock('../../env', () => ({ getOpenAiApiKey: jest.fn(() => 'sk-test') }));
const { getOpenAiApiKey } = require('../../env');

const fetchMock = jest.fn();
global.fetch = fetchMock as never;

const write = jest.fn(async (b64: string) => `file://audio-${b64.length}.mp3`);

function okResponse(bytes = 4) {
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(bytes) };
}

beforeEach(() => {
  fetchMock.mockReset();
  write.mockClear();
  (getOpenAiApiKey as jest.Mock).mockReturnValue('sk-test');
});

it('bridge synthesizer posts to /tts with auth and a per-language voice', async () => {
  fetchMock.mockResolvedValue(okResponse());
  const synth = createBridgeSynthesizer(write);
  const uri = await synth('hola', { language: 'es-ES' });
  expect(uri).toMatch(/^file:\/\/audio-/);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toMatch(/\/tts$/);
  expect(init.headers['X-Coder-Key']).toBeDefined();
  const body = JSON.parse(init.body);
  expect(body).toMatchObject({ text: 'hola', language: 'es-ES', voice: 'ef_dora' });
});

it('bridge synthesizer returns null on HTTP failure', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });
  expect(await createBridgeSynthesizer(write)('hi')).toBeNull();
});

it('bridge synthesizer returns null on network error and empty audio', async () => {
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  expect(await createBridgeSynthesizer(write)('hi')).toBeNull();
  fetchMock.mockResolvedValueOnce(okResponse(0));
  expect(await createBridgeSynthesizer(write)('hi')).toBeNull();
});

it('openai synthesizer sends the key and the tts model', async () => {
  fetchMock.mockResolvedValue(okResponse());
  const uri = await createOpenAiSynthesizer(write)('hello', { language: 'en-US' });
  expect(uri).toMatch(/^file:\/\//);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain('api.openai.com/v1/audio/speech');
  expect(init.headers.Authorization).toBe('Bearer sk-test');
  expect(JSON.parse(init.body).model).toBe('gpt-4o-mini-tts');
});

it('openai synthesizer is unavailable without a key', async () => {
  (getOpenAiApiKey as jest.Mock).mockReturnValue(null);
  expect(await createOpenAiSynthesizer(write)('hello')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
