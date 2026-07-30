// Reads the reply ALOUD as it streams: each completed sentence in the
// live stream text is queued into the speaker while generation continues,
// so speech starts with the first sentence instead of after the whole
// turn. Code fences, the SPEECH: marker line, and markdown noise are
// never spoken; the trailing partial sentence waits until it completes.
import type { SpeakResult } from '../speech/types';

/** Speakable COMPLETE sentences in stream text (append-only stable). */
export function extractSpeakableSentences(text: string): string[] {
  // Even-indexed chunks are outside ``` fences; an unclosed fence leaves
  // its content on an odd index, so in-progress code is excluded too.
  const chunks = text.split('```');
  let outside = '';
  for (let i = 0; i < chunks.length; i += 2) outside += `${chunks[i]}\n`;
  const lines = outside.split('\n').filter((l) => !l.trim().startsWith('SPEECH:'));
  const clean = lines
    .join(' ')
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const matches = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

export type StreamReader = {
  /** Feed the full stream text so far; new complete sentences queue up. */
  update(fullText: string): void;
  /** Resolves when everything queued so far has been spoken. */
  drain(): Promise<void>;
  /** Stop speaking and ignore any further updates until reset(). */
  cancel(): void;
  /** Whether at least one sentence was actually spoken. */
  spoke(): boolean;
  /** Whether the user silenced this turn's reading. */
  wasCancelled(): boolean;
  /** Fresh turn. */
  reset(): void;
};

export function createStreamReader(
  speak: (sentence: string) => Promise<SpeakResult>,
): StreamReader {
  let queued = 0;
  let chain: Promise<void> = Promise.resolve();
  let cancelled = false;
  let spokeFlag = false;

  return {
    update(fullText: string): void {
      if (cancelled) return;
      const sentences = extractSpeakableSentences(fullText);
      for (let i = queued; i < sentences.length; i += 1) {
        const sentence = sentences[i];
        chain = chain.then(async () => {
          if (cancelled) return;
          const result = await speak(sentence);
          if (result === 'done') spokeFlag = true;
        });
      }
      queued = Math.max(queued, sentences.length);
    },

    drain(): Promise<void> {
      return chain;
    },

    cancel(): void {
      cancelled = true;
    },

    spoke(): boolean {
      return spokeFlag;
    },

    wasCancelled(): boolean {
      return cancelled;
    },

    reset(): void {
      queued = 0;
      chain = Promise.resolve();
      cancelled = false;
      spokeFlag = false;
    },
  };
}
