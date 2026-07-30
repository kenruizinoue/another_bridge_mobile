import { createRemoteSpeaker, type PlayHandle } from '../remoteSpeaker';

function fakePlayer() {
  let finish: ((r: 'done' | 'stopped' | 'error') => void) | null = null;
  const handle: PlayHandle = { stop: jest.fn(() => finish?.('stopped')) };
  const play = jest.fn((uri: string, onFinish: (r: 'done' | 'stopped' | 'error') => void) => {
    finish = onFinish;
    return handle;
  });
  return { play, handle, finish: (r: 'done' | 'stopped' | 'error') => finish?.(r) };
}

it('synthesizes then plays, resolving done on finish', async () => {
  const { play, finish } = fakePlayer();
  const speaker = createRemoteSpeaker(async () => 'file://a.mp3', play);
  const result = speaker.speak('hello');
  await Promise.resolve();
  await Promise.resolve();
  expect(play).toHaveBeenCalledWith('file://a.mp3', expect.any(Function));
  finish('done');
  expect(await result).toBe('done');
});

it('resolves error when synthesis fails so the router can fall back', async () => {
  const { play } = fakePlayer();
  const speaker = createRemoteSpeaker(async () => null, play);
  expect(await speaker.speak('hello')).toBe('error');
  expect(play).not.toHaveBeenCalled();
});

it('stop during playback resolves stopped', async () => {
  const { play } = fakePlayer();
  const speaker = createRemoteSpeaker(async () => 'file://a.mp3', play);
  const result = speaker.speak('long text');
  await Promise.resolve();
  await Promise.resolve();
  speaker.stop();
  expect(await result).toBe('stopped');
});

it('stop during synthesis never plays the late audio', async () => {
  const { play } = fakePlayer();
  let resolveSynth: (uri: string) => void = () => {};
  const speaker = createRemoteSpeaker(
    () => new Promise((resolve) => (resolveSynth = resolve)),
    play,
  );
  const result = speaker.speak('text');
  speaker.stop();
  resolveSynth('file://late.mp3');
  expect(await result).toBe('stopped');
  expect(play).not.toHaveBeenCalled();
});

it('blank text is done without any work', async () => {
  const { play } = fakePlayer();
  const synthesize = jest.fn(async () => 'file://a.mp3');
  const speaker = createRemoteSpeaker(synthesize, play);
  expect(await speaker.speak('  ')).toBe('done');
  expect(synthesize).not.toHaveBeenCalled();
});
