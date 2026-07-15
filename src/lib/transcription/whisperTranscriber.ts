import { Platform } from 'react-native';
import { initWhisper, type WhisperContext } from 'whisper.rn';
import type { TranscribeOptions, Transcriber } from './types';
import type { WhisperModel } from './whisperModel';

/**
 * On-device Whisper transcription via whisper.rn (iOS). The native
 * context is loaded once and reused. Input must be a WAV file, which the
 * recorder produces. Any failure resolves to null so the router can fall
 * back.
 */
export function createWhisperTranscriber(model: WhisperModel): Transcriber {
  let contextPromise: Promise<WhisperContext | null> | null = null;

  async function getContext(): Promise<WhisperContext | null> {
    if (Platform.OS !== 'ios') return null;
    if (!(await model.isReady())) return null;
    if (!contextPromise) {
      contextPromise = initWhisper({
        filePath: model.path,
        useGpu: true,
        useCoreMLIos: false,
      }).catch(() => {
        contextPromise = null; // allow retry next time
        return null;
      });
    }
    return contextPromise;
  }

  return {
    engine: 'whisper',

    async isAvailable(): Promise<boolean> {
      return Platform.OS === 'ios' && (await model.isReady());
    },

    async transcribe(wavUri: string, options?: TranscribeOptions): Promise<string | null> {
      try {
        const context = await getContext();
        if (!context || !wavUri) return null;
        const language = (options?.language ?? 'en').split('-')[0];
        const { promise } = context.transcribe(wavUri, { language, maxThreads: 4 });
        const { result } = await promise;
        const text = (result ?? '').trim();
        return text || null;
      } catch {
        return null;
      }
    },
  };
}
