import { getOpenAiApiKey } from '../env';
import type { TranscribeOptions, Transcriber } from './types';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'gpt-4o-mini-transcribe';

/**
 * Cloud transcription via the OpenAI API, called directly from the app
 * with the user's own key (no backend). Returns null on any failure so
 * the router can fall back to another engine.
 */
export const openaiTranscriber: Transcriber = {
  engine: 'openai',

  async isAvailable(): Promise<boolean> {
    return getOpenAiApiKey() !== null;
  },

  async transcribe(fileUri: string, options?: TranscribeOptions): Promise<string | null> {
    const key = getOpenAiApiKey();
    if (!key || !fileUri) return null;

    const form = new FormData();
    // React Native FormData accepts a file descriptor object here.
    form.append('file', { uri: fileUri, name: 'audio.wav', type: 'audio/wav' } as unknown as Blob);
    form.append('model', MODEL);
    if (options?.language) {
      form.append('language', options.language.split('-')[0]);
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { text?: unknown };
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      return text || null;
    } catch {
      return null;
    }
  },
};
