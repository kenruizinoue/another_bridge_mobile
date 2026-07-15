import { appleTranscriber } from './appleTranscriber';
import { openaiTranscriber } from './openaiTranscriber';
import { getTranscribePreference } from './preference';
import type { TranscribeOptions, Transcriber, TranscriptionEngine } from './types';
import { whisperModel } from './whisperModel';
import { createWhisperTranscriber } from './whisperTranscriber';

export type TranscriptionResult =
  | { text: string; engine: TranscriptionEngine }
  | { text: null; engine: null };

// Fallback chain: the preferred engine first, then the rest in this order.
const FALLBACK_ORDER: TranscriptionEngine[] = ['whisper', 'apple', 'openai'];

function engineOrder(preferred: TranscriptionEngine): TranscriptionEngine[] {
  return [preferred, ...FALLBACK_ORDER.filter((engine) => engine !== preferred)];
}

export type TranscriptionRouterDeps = {
  adapters: Record<TranscriptionEngine, Transcriber>;
  getPreference: () => Promise<TranscriptionEngine>;
};

/**
 * Routes a transcription to the preferred engine, falling back through
 * the remaining engines when one is unavailable or returns nothing.
 * Reports which engine produced the transcript, or a null result when
 * every engine fails.
 */
export function createTranscriptionRouter(deps: TranscriptionRouterDeps) {
  return {
    async transcribe(fileUri: string, options?: TranscribeOptions): Promise<TranscriptionResult> {
      const preferred = await deps.getPreference();
      for (const engine of engineOrder(preferred)) {
        const adapter = deps.adapters[engine];
        if (!adapter || !(await adapter.isAvailable())) {
          continue;
        }
        const text = await adapter.transcribe(fileUri, options);
        if (text) {
          return { text, engine };
        }
      }
      return { text: null, engine: null };
    },
  };
}

// App-wide default router wired to the real engines.
export const transcriptionRouter = createTranscriptionRouter({
  adapters: {
    apple: appleTranscriber,
    whisper: createWhisperTranscriber(whisperModel),
    openai: openaiTranscriber,
  },
  getPreference: getTranscribePreference,
});
