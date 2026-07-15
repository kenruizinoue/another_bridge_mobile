import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TranscriptionEngine, VoiceLanguage } from './types';

const KEY = 'transcribe-engine';
const LANG_KEY = 'voice-language';

/**
 * Where voice transcription happens:
 *  - "apple"   on-device Apple Speech (iOS), free and offline. Default.
 *  - "whisper" on-device Whisper, best local quality, one-time model download.
 *  - "openai"  cloud, uses your OpenAI key (EXPO_PUBLIC_OPENAI_API_KEY).
 */
export async function getTranscribePreference(): Promise<TranscriptionEngine> {
  const value = await AsyncStorage.getItem(KEY);
  if (value === 'openai') return 'openai';
  if (value === 'whisper') return 'whisper';
  // "apple", unknown values, or unset default to on-device Apple Speech.
  return 'apple';
}

export async function setTranscribePreference(engine: TranscriptionEngine): Promise<void> {
  await AsyncStorage.setItem(KEY, engine);
}

/**
 * Dictation language, passed to every engine so none of them has to
 * auto-detect (Whisper especially confuses Spanish with Portuguese when
 * left guessing). Default English.
 */
export async function getVoiceLanguage(): Promise<VoiceLanguage> {
  const value = await AsyncStorage.getItem(LANG_KEY);
  return value === 'es-ES' ? 'es-ES' : 'en-US';
}

export async function setVoiceLanguage(language: VoiceLanguage): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, language);
}
