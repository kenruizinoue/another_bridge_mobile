// Transcription domain contracts. Concrete engines live in this folder
// and are selected by the router. Every engine returns a string on
// success or null on ANY failure so the router can fall back to the
// next engine instead of surfacing partial errors.

export type TranscriptionEngine = 'apple' | 'whisper' | 'openai';

// Dictation languages offered in settings. Pinning the language (instead
// of letting engines auto-detect) is what stops Whisper from hearing
// Spanish and answering in Portuguese.
export type VoiceLanguage = 'en-US' | 'es-ES';

export type TranscribeOptions = {
  /** BCP-47 language tag, e.g. "en-US". */
  language?: string;
};

export interface Transcriber {
  readonly engine: TranscriptionEngine;
  /** Whether this engine can run on the current device/config. */
  isAvailable(): Promise<boolean>;
  /** Transcribe an audio file. Resolves null on any failure. */
  transcribe(fileUri: string, options?: TranscribeOptions): Promise<string | null>;
}
