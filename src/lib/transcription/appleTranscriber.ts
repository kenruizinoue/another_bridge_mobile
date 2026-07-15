import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';
import type { TranscribeOptions, Transcriber } from './types';

const MAX_WAIT_MS = 30_000;

function available(): boolean {
  return Platform.OS === 'ios' && !!ExpoSpeechRecognitionModule;
}

async function ensurePermission(): Promise<boolean> {
  try {
    const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return !!requested.granted;
  } catch {
    return false;
  }
}

/**
 * On-device transcription via Apple's Speech framework (iOS only),
 * transcribing a recorded file so audio never leaves the phone. Any
 * failure (unsupported device, denied permission, recognizer error,
 * empty result, timeout) resolves to null so the router can fall back.
 */
export const appleTranscriber: Transcriber = {
  engine: 'apple',

  async isAvailable(): Promise<boolean> {
    return available();
  },

  async transcribe(fileUri: string, options?: TranscribeOptions): Promise<string | null> {
    if (!available() || !fileUri) return null;
    if (!(await ensurePermission())) return null;

    const lang = options?.language ?? 'en-US';

    return new Promise<string | null>((resolve) => {
      let finalText = '';
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const subscriptions: { remove: () => void }[] = [];

      const cleanup = () => {
        for (const sub of subscriptions) {
          try {
            sub.remove();
          } catch {
            // ignore
          }
        }
      };

      const done = (value: string | null) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        cleanup();
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          // ignore
        }
        resolve(value);
      };

      subscriptions.push(
        ExpoSpeechRecognitionModule.addListener('result', (event) => {
          const transcript = event?.results?.[0]?.transcript;
          if (typeof transcript === 'string' && transcript.length > 0) {
            finalText = transcript;
          }
        }),
      );
      subscriptions.push(
        ExpoSpeechRecognitionModule.addListener('end', () => done(finalText.trim() || null)),
      );
      subscriptions.push(ExpoSpeechRecognitionModule.addListener('error', () => done(null)));

      try {
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: false,
          requiresOnDeviceRecognition: true,
          audioSource: { uri: fileUri },
        });
      } catch {
        done(null);
        return;
      }

      timeoutId = setTimeout(() => done(finalText.trim() || null), MAX_WAIT_MS);
    });
  },
};
