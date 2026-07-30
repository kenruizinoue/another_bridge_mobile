// On-device TTS via expo-speech (AVSpeechSynthesizer on iOS). Free and
// offline, good enough for the short conversation summaries; higher
// quality engines can implement Speaker later without touching callers.
import * as Speech from 'expo-speech';
import type { SpeakOptions, Speaker, SpeakResult } from './types';

export const expoSpeaker: Speaker = {
  speak(text: string, options?: SpeakOptions): Promise<SpeakResult> {
    if (!text.trim()) return Promise.resolve('done');
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: SpeakResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      Speech.speak(text, {
        language: options?.language,
        rate: options?.rate,
        onDone: () => settle('done'),
        onStopped: () => settle('stopped'),
        onError: () => settle('error'),
      });
    });
  },

  stop(): void {
    Speech.stop();
  },
};
