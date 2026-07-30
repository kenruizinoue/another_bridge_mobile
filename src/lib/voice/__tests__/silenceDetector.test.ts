import { createSilenceDetector } from '../silenceDetector';

// Feed a detector a scripted meter stream: [msOffset, levelDb][]
function run(
  detector: ReturnType<typeof createSilenceDetector>,
  samples: [number, number | undefined][],
) {
  return samples.map(([at, level]) => detector.push(level, at));
}

const OPTS = { speechThresholdDb: -35, silenceWindowMs: 1000, noSpeechTimeoutMs: 8000 };

it('emits speech-started once when the level crosses the threshold', () => {
  const d = createSilenceDetector(OPTS);
  const events = run(d, [
    [0, -60],
    [100, -20],
    [200, -18],
  ]);
  expect(events).toEqual([null, 'speech-started', null]);
});

it('emits end-of-speech after a full silence window following speech', () => {
  const d = createSilenceDetector(OPTS);
  const events = run(d, [
    [0, -20], // speaking
    [200, -22],
    [400, -60], // silence begins
    [900, -58],
    [1390, -61], // 990ms of silence, not yet
    [1450, -59], // 1050ms, window passed
  ]);
  expect(events).toEqual(['speech-started', null, null, null, null, 'end-of-speech']);
});

it('a brief dip shorter than the window does not end the turn', () => {
  const d = createSilenceDetector(OPTS);
  const events = run(d, [
    [0, -20],
    [300, -60], // dip
    [700, -20], // speaking again before 1000ms of silence
    [1600, -21],
  ]);
  expect(events).toEqual(['speech-started', null, null, null]);
});

it('emits no-speech-timeout when nothing is ever said', () => {
  const d = createSilenceDetector(OPTS);
  const events = run(d, [
    [0, -70],
    [4000, -65],
    [8100, -68],
  ]);
  expect(events).toEqual([null, null, 'no-speech-timeout']);
});

it('treats undefined metering as silence', () => {
  const d = createSilenceDetector(OPTS);
  const events = run(d, [
    [0, undefined],
    [8200, undefined],
  ]);
  expect(events).toEqual([null, 'no-speech-timeout']);
});

it('end-of-speech fires only once per capture', () => {
  const d = createSilenceDetector(OPTS);
  run(d, [
    [0, -20],
    [100, -60],
    [1200, -60],
  ]);
  expect(d.push(-60, 2400)).toBeNull();
});

it('reset starts a fresh capture', () => {
  const d = createSilenceDetector(OPTS);
  run(d, [
    [0, -20],
    [100, -60],
    [1200, -60], // end-of-speech
  ]);
  d.reset();
  const events = run(d, [
    [2000, -20],
    [2100, -60],
    [3200, -60],
  ]);
  expect(events).toEqual(['speech-started', null, 'end-of-speech']);
});

it('uses the documented defaults when no options are given', () => {
  const d = createSilenceDetector();
  // Default threshold -35: -30 counts as speech.
  expect(d.push(-30, 0)).toBe('speech-started');
  // Default window 1200ms: silence at +1100 not yet, +1300 ends.
  expect(d.push(-60, 100)).toBeNull();
  expect(d.push(-60, 1200)).toBeNull();
  expect(d.push(-60, 1400)).toBe('end-of-speech');
});
