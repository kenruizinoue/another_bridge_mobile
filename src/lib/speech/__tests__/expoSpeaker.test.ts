import * as Speech from 'expo-speech';
import { expoSpeaker } from '../expoSpeaker';

const speak = Speech.speak as jest.Mock;
const stop = Speech.stop as jest.Mock;

beforeEach(() => {
  speak.mockClear();
  stop.mockClear();
});

function lastOptions() {
  return speak.mock.calls[speak.mock.calls.length - 1][1];
}

it('resolves done when playback finishes', async () => {
  const result = expoSpeaker.speak('hello there');
  lastOptions().onDone();
  expect(await result).toBe('done');
  expect(speak).toHaveBeenCalledWith('hello there', expect.any(Object));
});

it('resolves stopped when interrupted', async () => {
  const result = expoSpeaker.speak('a long reply');
  expoSpeaker.stop();
  lastOptions().onStopped();
  expect(await result).toBe('stopped');
  expect(stop).toHaveBeenCalled();
});

it('resolves error when the engine fails', async () => {
  const result = expoSpeaker.speak('boom');
  lastOptions().onError(new Error('engine'));
  expect(await result).toBe('error');
});

it('passes language and rate through', () => {
  void expoSpeaker.speak('hola', { language: 'es-ES', rate: 1.1 });
  expect(lastOptions().language).toBe('es-ES');
  expect(lastOptions().rate).toBe(1.1);
});

it('resolves done immediately for blank text without speaking', async () => {
  expect(await expoSpeaker.speak('   ')).toBe('done');
  expect(speak).not.toHaveBeenCalled();
});

it('resolves at most once even if callbacks double-fire', async () => {
  const result = expoSpeaker.speak('once');
  lastOptions().onDone();
  lastOptions().onStopped();
  expect(await result).toBe('done');
});
