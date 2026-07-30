// Pure end-of-speech detector for conversation mode. The caller polls the
// recorder's metering level (dBFS, negative, 0 = clipping) and pushes each
// sample with its timestamp; the detector answers with at most one event.
// No timers and no native access, so it is fully unit-testable and engine
// agnostic (works the same above Apple, Whisper, or OpenAI transcription).

export type SilenceEvent = 'speech-started' | 'end-of-speech' | 'no-speech-timeout' | null;

export type SilenceDetectorOptions = {
  /** Levels above this dBFS count as speech. */
  speechThresholdDb?: number;
  /** Silence run after speech that ends the turn. */
  silenceWindowMs?: number;
  /** Give up when no speech at all for this long. */
  noSpeechTimeoutMs?: number;
};

export const SILENCE_DEFAULTS = {
  speechThresholdDb: -35,
  silenceWindowMs: 1200,
  noSpeechTimeoutMs: 10_000,
} as const;

export function createSilenceDetector(options: SilenceDetectorOptions = {}) {
  const speechThresholdDb = options.speechThresholdDb ?? SILENCE_DEFAULTS.speechThresholdDb;
  const silenceWindowMs = options.silenceWindowMs ?? SILENCE_DEFAULTS.silenceWindowMs;
  const noSpeechTimeoutMs = options.noSpeechTimeoutMs ?? SILENCE_DEFAULTS.noSpeechTimeoutMs;

  let firstSampleAt: number | null = null;
  let speechSeen = false;
  let silenceSince: number | null = null;
  let done = false;

  return {
    /** Feed one metering sample; undefined metering counts as silence. */
    push(meteringDb: number | undefined, nowMs: number): SilenceEvent {
      if (done) return null;
      if (firstSampleAt === null) firstSampleAt = nowMs;

      const speaking = meteringDb !== undefined && meteringDb > speechThresholdDb;

      if (speaking) {
        silenceSince = null;
        if (!speechSeen) {
          speechSeen = true;
          return 'speech-started';
        }
        return null;
      }

      if (!speechSeen) {
        if (nowMs - firstSampleAt >= noSpeechTimeoutMs) {
          done = true;
          return 'no-speech-timeout';
        }
        return null;
      }

      if (silenceSince === null) {
        silenceSince = nowMs;
        return null;
      }
      if (nowMs - silenceSince >= silenceWindowMs) {
        done = true;
        return 'end-of-speech';
      }
      return null;
    },

    /** Start a fresh capture (new listening turn). */
    reset(): void {
      firstSampleAt = null;
      speechSeen = false;
      silenceSince = null;
      done = false;
    },
  };
}
