import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getTranscribePreference,
  getVoiceLanguage,
  setTranscribePreference,
  setVoiceLanguage,
} from '../preference';

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('defaults to apple when nothing is stored', async () => {
  expect(await getTranscribePreference()).toBe('apple');
});

it('round-trips each engine', async () => {
  for (const engine of ['whisper', 'openai', 'apple'] as const) {
    await setTranscribePreference(engine);
    expect(await getTranscribePreference()).toBe(engine);
  }
});

it('unknown stored values fall back to apple', async () => {
  await AsyncStorage.setItem('transcribe-engine', 'gibberish');
  expect(await getTranscribePreference()).toBe('apple');
});

it('voice language defaults to en-US and round-trips es-ES', async () => {
  expect(await getVoiceLanguage()).toBe('en-US');
  await setVoiceLanguage('es-ES');
  expect(await getVoiceLanguage()).toBe('es-ES');
  await setVoiceLanguage('en-US');
  expect(await getVoiceLanguage()).toBe('en-US');
});

it('unknown stored language falls back to en-US', async () => {
  await AsyncStorage.setItem('voice-language', 'fr-FR');
  expect(await getVoiceLanguage()).toBe('en-US');
});
