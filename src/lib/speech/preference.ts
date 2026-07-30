// Where the reply's voice comes from:
//  - "device"  on-device AVSpeechSynthesizer (expo-speech). Default.
//  - "neural"  on-device Piper voice via sherpa-onnx. Higher quality;
//              one-time voice download, voice chosen separately.
//  - "bridge"  the Mac's Kokoro service proxied through the bridge /tts.
//  - "openai"  OpenAI TTS, called directly with the user's own key.
// Mirrors the transcription preference module so settings stay symmetric.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_VOICE_ID } from './neural/voices';

const KEY = 'speech-engine';
const NEURAL_VOICE_KEY = 'speech-neural-voice';
const OPENAI_VOICE_KEY = 'speech-openai-voice';

export type SpeechEngine = 'device' | 'neural' | 'bridge' | 'openai';

/** Voices offered by OpenAI's gpt-4o-mini-tts (all multilingual). */
export const OPENAI_VOICES = ['alloy', 'nova', 'coral', 'onyx', 'sage', 'shimmer'] as const;
export type OpenAiVoice = (typeof OPENAI_VOICES)[number];

export async function getSpeechEngine(): Promise<SpeechEngine> {
  const value = await AsyncStorage.getItem(KEY);
  if (value === 'neural') return 'neural';
  if (value === 'bridge') return 'bridge';
  if (value === 'openai') return 'openai';
  return 'device';
}

export async function setSpeechEngine(engine: SpeechEngine): Promise<void> {
  await AsyncStorage.setItem(KEY, engine);
}

export async function getNeuralVoiceId(): Promise<string> {
  return (await AsyncStorage.getItem(NEURAL_VOICE_KEY)) ?? DEFAULT_VOICE_ID;
}

export async function setNeuralVoiceId(id: string): Promise<void> {
  await AsyncStorage.setItem(NEURAL_VOICE_KEY, id);
}

export async function getOpenAiVoice(): Promise<OpenAiVoice> {
  const value = await AsyncStorage.getItem(OPENAI_VOICE_KEY);
  return (OPENAI_VOICES as readonly string[]).includes(value ?? '')
    ? (value as OpenAiVoice)
    : 'alloy';
}

export async function setOpenAiVoice(voice: OpenAiVoice): Promise<void> {
  await AsyncStorage.setItem(OPENAI_VOICE_KEY, voice);
}
