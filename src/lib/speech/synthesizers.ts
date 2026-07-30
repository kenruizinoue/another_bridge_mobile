// The two remote synthesis backends. Both fetch audio bytes and hand
// back a local file uri for the player; failures return null so the
// speech router can fall back to the on-device voice.
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import { BRIDGE_URL, bridgeHeaders } from '../../api/client';
import { getOpenAiApiKey } from '../env';
import { getOpenAiVoice } from './preference';
import type { Synthesize } from './remoteSpeaker';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const OPENAI_MODEL = 'gpt-4o-mini-tts';

// Kokoro ships language-specific voices; OpenAI voices are multilingual.
const KOKORO_VOICE: Record<string, string> = { 'en-US': 'af_heart', 'es-ES': 'ef_dora' };

export type WriteAudioFile = (base64: string) => Promise<string>;

let fileCounter = 0;

/** Default writer: a cache file the player can open by uri. */
export const writeCacheAudioFile: WriteAudioFile = async (base64) => {
  fileCounter += 1;
  const path = `${FileSystem.cacheDirectory ?? ''}speech-${fileCounter}.mp3`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
};

async function fetchToFile(
  url: string,
  init: RequestInit,
  write: WriteAudioFile,
): Promise<string | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return null;
    return await write(Buffer.from(bytes).toString('base64'));
  } catch {
    return null;
  }
}

/** Kokoro on the Mac, proxied through the bridge's /tts route. */
export function createBridgeSynthesizer(write: WriteAudioFile = writeCacheAudioFile): Synthesize {
  return (text, options) =>
    fetchToFile(
      `${BRIDGE_URL}/tts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bridgeHeaders() },
        body: JSON.stringify({
          text,
          ...(options?.language && {
            language: options.language,
            voice: KOKORO_VOICE[options.language],
          }),
        }),
      },
      write,
    );
}

/** OpenAI TTS, called directly with the user's own key (no backend). */
export function createOpenAiSynthesizer(write: WriteAudioFile = writeCacheAudioFile): Synthesize {
  return async (text, options) => {
    const key = getOpenAiApiKey();
    if (!key) return null;
    const voice = await getOpenAiVoice();
    return fetchToFile(
      OPENAI_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: text,
          voice,
          response_format: 'mp3',
          ...(options?.language && { instructions: `Speak in ${options.language}.` }),
        }),
      },
      write,
    );
  };
}
