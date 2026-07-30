// Text-to-speech contract for conversation mode. Hooks depend on this
// interface only; the expo-speech implementation lives next door and tests
// inject fakes, mirroring the transcription layer's structure.

export type SpeakResult = 'done' | 'stopped' | 'error';

export type SpeakOptions = {
  /** BCP-47 language for the voice, e.g. 'en-US'. */
  language?: string;
  /** 1.0 is the platform's normal speaking rate. */
  rate?: number;
};

export interface Speaker {
  /** Speak the text; resolves when playback finishes, is stopped, or fails. */
  speak(text: string, options?: SpeakOptions): Promise<SpeakResult>;
  /** Interrupt current playback; the pending speak() resolves 'stopped'. */
  stop(): void;
  /** Optional: load models/engines ahead of the first speak (cheap no-op
   *  for engines without startup cost). */
  prewarm?(): Promise<void>;
}
