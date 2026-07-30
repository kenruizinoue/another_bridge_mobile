import { createSpeechRouter } from '../router';
import type { Speaker, SpeakResult } from '../types';

function fake(result: SpeakResult): Speaker & { speak: jest.Mock; stop: jest.Mock } {
  return { speak: jest.fn(async () => result), stop: jest.fn() };
}

it('uses the preferred engine when it succeeds', async () => {
  const device = fake('done');
  const bridge = fake('done');
  const openai = fake('done');
  const router = createSpeechRouter({
    engines: { device, neural: fake('done'), bridge, openai },
    getPreference: async () => 'bridge',
  });
  expect(await router.speak('hi', { language: 'en-US' })).toBe('done');
  expect(bridge.speak).toHaveBeenCalledWith('hi', { language: 'en-US' });
  expect(device.speak).not.toHaveBeenCalled();
});

it('falls back to the device voice when the remote engine errors', async () => {
  const device = fake('done');
  const bridge = fake('error');
  const router = createSpeechRouter({
    engines: { device, neural: fake('done'), bridge, openai: fake('done') },
    getPreference: async () => 'bridge',
  });
  expect(await router.speak('hi')).toBe('done');
  expect(device.speak).toHaveBeenCalled();
});

it('stopped is a final outcome, not a fallback trigger', async () => {
  const device = fake('done');
  const openai = fake('stopped');
  const router = createSpeechRouter({
    engines: { device, neural: fake('done'), bridge: fake('done'), openai },
    getPreference: async () => 'openai',
  });
  expect(await router.speak('hi')).toBe('stopped');
  expect(device.speak).not.toHaveBeenCalled();
});

it('stop reaches the engine that is currently speaking', async () => {
  const bridge = fake('done');
  const router = createSpeechRouter({
    engines: { device: fake('done'), neural: fake('done'), bridge, openai: fake('done') },
    getPreference: async () => 'bridge',
  });
  await router.speak('hi');
  router.stop();
  expect(bridge.stop).toHaveBeenCalled();
});

it('reports error only when every engine in the chain fails', async () => {
  const router = createSpeechRouter({
    engines: { device: fake('error'), neural: fake('error'), bridge: fake('error'), openai: fake('error') },
    getPreference: async () => 'bridge',
  });
  expect(await router.speak('hi')).toBe('error');
});

it('prewarm reaches only the preferred engine', async () => {
  const neural = { ...fake('done'), prewarm: jest.fn(async () => {}) };
  const device = { ...fake('done'), prewarm: jest.fn(async () => {}) };
  const router = createSpeechRouter({
    engines: { device, neural, bridge: fake('done'), openai: fake('done') },
    getPreference: async () => 'neural',
  });
  await router.prewarm?.();
  expect(neural.prewarm).toHaveBeenCalled();
  expect(device.prewarm).not.toHaveBeenCalled();
});
