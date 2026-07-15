import { createTranscriptionRouter } from '../router';
import type { Transcriber, TranscriptionEngine } from '../types';

function fake(
  engine: TranscriptionEngine,
  available: boolean,
  text: string | null,
): Transcriber & { transcribe: jest.Mock } {
  return {
    engine,
    isAvailable: jest.fn(async () => available),
    transcribe: jest.fn(async () => text),
  };
}

function makeRouter(
  adapters: Record<TranscriptionEngine, Transcriber>,
  preferred: TranscriptionEngine,
) {
  return createTranscriptionRouter({ adapters, getPreference: async () => preferred });
}

it('uses the preferred engine when it succeeds', async () => {
  const apple = fake('apple', true, 'from apple');
  const whisper = fake('whisper', true, 'from whisper');
  const openai = fake('openai', true, 'from openai');
  const router = makeRouter({ apple, whisper, openai }, 'apple');

  expect(await router.transcribe('file://a.wav')).toEqual({
    text: 'from apple',
    engine: 'apple',
  });
  expect(whisper.transcribe).not.toHaveBeenCalled();
  expect(openai.transcribe).not.toHaveBeenCalled();
});

it('skips unavailable engines and falls back in order', async () => {
  const apple = fake('apple', false, 'never');
  const whisper = fake('whisper', true, 'from whisper');
  const openai = fake('openai', true, 'from openai');
  const router = makeRouter({ apple, whisper, openai }, 'apple');

  expect(await router.transcribe('file://a.wav')).toEqual({
    text: 'from whisper',
    engine: 'whisper',
  });
  expect(apple.transcribe).not.toHaveBeenCalled();
});

it('falls back when the preferred engine returns null', async () => {
  const apple = fake('apple', true, null);
  const whisper = fake('whisper', true, null);
  const openai = fake('openai', true, 'cloud text');
  const router = makeRouter({ apple, whisper, openai }, 'apple');

  expect(await router.transcribe('file://a.wav')).toEqual({
    text: 'cloud text',
    engine: 'openai',
  });
});

it('returns a null result when every engine fails', async () => {
  const apple = fake('apple', true, null);
  const whisper = fake('whisper', false, null);
  const openai = fake('openai', false, null);
  const router = makeRouter({ apple, whisper, openai }, 'whisper');

  expect(await router.transcribe('file://a.wav')).toEqual({ text: null, engine: null });
});

it('a non-apple preference goes first', async () => {
  const apple = fake('apple', true, 'from apple');
  const whisper = fake('whisper', true, 'from whisper');
  const openai = fake('openai', true, 'from openai');
  const router = makeRouter({ apple, whisper, openai }, 'openai');

  expect(await router.transcribe('file://a.wav')).toEqual({
    text: 'from openai',
    engine: 'openai',
  });
});
