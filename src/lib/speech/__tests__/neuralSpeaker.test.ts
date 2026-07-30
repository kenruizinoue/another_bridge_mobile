import { createNeuralSpeaker, segmentize } from '../neuralSpeaker';
import type { PlayHandle } from '../remoteSpeaker';

function fakeTts() {
  return {
    initialize: jest.fn(async () => {}),
    deinitialize: jest.fn(),
    generateAndSave: jest.fn(async (_text: string, path: string) => path),
  };
}

// Plays every segment instantly unless told to hang.
function instantPlayer() {
  const played: string[] = [];
  const play = jest.fn((uri: string, onFinish: (r: 'done' | 'stopped' | 'error') => void) => {
    played.push(uri);
    onFinish('done');
    return { stop: jest.fn() } as PlayHandle;
  });
  return { play, played };
}

function speaker(overrides: Parameters<typeof createNeuralSpeaker>[0] = {}) {
  return createNeuralSpeaker({
    tts: fakeTts(),
    play: instantPlayer().play,
    isReady: async () => true,
    paths: () => ({ modelPath: '/m', tokensPath: '/t', dataDirPath: '/d' }),
    getVoiceId: async () => 'lessac-high',
    ensureCacheDir: async () => '/cache/',
    ...overrides,
  });
}

it('segmentize splits long text at sentence boundaries', () => {
  const segs = segmentize(
    'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen. ' +
      'Sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty.',
  );
  expect(segs.length).toBeGreaterThan(1);
  expect(segs.join(' ')).toContain('thirty');
});

it('synthesizes each segment and plays them in order', async () => {
  const tts = fakeTts();
  const { play, played } = instantPlayer();
  const s = createNeuralSpeaker({
    tts,
    play,
    isReady: async () => true,
    paths: () => ({ modelPath: '/m', tokensPath: '/t', dataDirPath: '/d' }),
    getVoiceId: async () => 'lessac-high',
    ensureCacheDir: async () => '/cache/',
  });
  expect(await s.speak('Short reply. Nothing fancy.')).toBe('done');
  expect(tts.initialize).toHaveBeenCalledTimes(1);
  expect(tts.generateAndSave).toHaveBeenCalled();
  expect(played.length).toBeGreaterThan(0);
});

it('errors when the voice is not downloaded so the router can fall back', async () => {
  const s = speaker({ isReady: async () => false });
  expect(await s.speak('hello')).toBe('error');
});

it('errors when synthesis fails before anything was spoken', async () => {
  const tts = fakeTts();
  tts.generateAndSave.mockRejectedValue(new Error('engine'));
  const s = speaker({ tts });
  expect(await s.speak('hello there')).toBe('error');
});

it('stop during playback resolves stopped', async () => {
  let finishRef: ((r: 'done' | 'stopped' | 'error') => void) | null = null;
  const play = jest.fn((_uri: string, onFinish: (r: 'done' | 'stopped' | 'error') => void) => {
    finishRef = onFinish;
    return { stop: jest.fn(() => finishRef?.('stopped')) } as PlayHandle;
  });
  const s = speaker({ play });
  const result = s.speak('A reply that keeps playing.');
  await new Promise((r) => setTimeout(r, 10));
  s.stop();
  expect(await result).toBe('stopped');
});

it('re-initializes the engine when the voice changes', async () => {
  const tts = fakeTts();
  let voice = 'lessac-high';
  const s = speaker({ tts, getVoiceId: async () => voice });
  await s.speak('first');
  voice = 'ryan-high';
  await s.speak('second');
  expect(tts.initialize).toHaveBeenCalledTimes(2);
  expect(tts.deinitialize).toHaveBeenCalledTimes(1);
});

it('blank text is done without engine work', async () => {
  const tts = fakeTts();
  const s = speaker({ tts });
  expect(await s.speak('   ')).toBe('done');
  expect(tts.initialize).not.toHaveBeenCalled();
});

it('the first segment stays short so first audio is fast', () => {
  const segs = segmentize(
    'Alright, I finished the refactor you asked for, updated the tests, and everything is green now. ' +
      'The details of the change are on screen for you to review whenever you want.',
  );
  expect(segs[0].split(/\s+/).length).toBeLessThanOrEqual(8);
  expect(segs.length).toBeGreaterThan(1);
});

it('prewarm loads the engine once and speak skips re-init', async () => {
  const tts = fakeTts();
  const s = speaker({ tts });
  await s.prewarm?.();
  expect(tts.initialize).toHaveBeenCalledTimes(1);
  await s.speak('hello there.');
  expect(tts.initialize).toHaveBeenCalledTimes(1);
});

it('prewarm is a no-op when the voice is not downloaded', async () => {
  const tts = fakeTts();
  const s = speaker({ tts, isReady: async () => false });
  await s.prewarm?.();
  expect(tts.initialize).not.toHaveBeenCalled();
});
