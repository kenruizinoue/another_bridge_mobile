// Manages the on-device neural TTS voices (Piper, run via sherpa-onnx),
// ported from another_interviewer. Each selectable voice's files (its
// 60-120 MB .onnx + tokens.txt) download on demand into a per-voice
// folder from the public Hugging Face mirror, exactly like the Whisper
// model. The shared, voice-independent espeak-ng-data phonemizer pack
// ships zipped inside the app (~9 MB) and is unpacked to disk once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';
import { getVoice, type NeuralVoice } from './voices';

const DIR = `${FileSystem.documentDirectory ?? ''}models/tts/`;
const ESPEAK_DIR = `${DIR}espeak-ng-data`;
const hf = (v: NeuralVoice, file: string) =>
  `https://huggingface.co/csukuangfj/${v.repo}/resolve/main/${file}`;

const voiceDir = (v: NeuralVoice) => `${DIR}voice-${v.id}/`;
const onnxPath = (v: NeuralVoice) => `${voiceDir(v)}${v.file}`;
const tokensPath = (v: NeuralVoice) => `${voiceDir(v)}tokens.txt`;
const readyKey = (id: string) => `ttsVoiceReady:${id}`;

const stripScheme = (uri: string) => uri.replace(/^file:\/\//, '');

/** Absolute paths handed to the sherpa-onnx engine at init time. */
export function getVoicePaths(voiceId: string): {
  modelPath: string;
  tokensPath: string;
  dataDirPath: string;
} {
  const v = getVoice(voiceId);
  return {
    modelPath: stripScheme(onnxPath(v)),
    tokensPath: stripScheme(tokensPath(v)),
    dataDirPath: stripScheme(ESPEAK_DIR),
  };
}

export async function isVoiceReady(voiceId: string): Promise<boolean> {
  if ((await AsyncStorage.getItem(readyKey(voiceId))) !== '1') return false;
  const v = getVoice(voiceId);
  const onnx = await FileSystem.getInfoAsync(onnxPath(v));
  const tokens = await FileSystem.getInfoAsync(tokensPath(v));
  const espeak = await FileSystem.getInfoAsync(ESPEAK_DIR);
  return (
    onnx.exists && (onnx.size ?? 0) > 1_000_000 && tokens.exists && espeak.exists
  );
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

// Unpack the bundled espeak-ng-data zip into the model dir (once, shared
// by all voices).
async function ensureEspeakData(): Promise<void> {
  const espeak = await FileSystem.getInfoAsync(ESPEAK_DIR);
  if (espeak.exists) return;
  const asset = Asset.fromModule(require('../../../../assets/tts/espeak-ng-data.zip'));
  await asset.downloadAsync();
  const src = asset.localUri ?? asset.uri;
  await unzip(stripScheme(src), stripScheme(DIR));
}

/**
 * Download a voice (reporting fractional progress 0..1) and ensure the
 * shared phonemizer data. Resolves true on success. Safe to call when
 * already present.
 */
export async function downloadVoice(
  voiceId: string,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  const v = getVoice(voiceId);
  if (await isVoiceReady(voiceId)) {
    onProgress?.(1);
    return true;
  }
  try {
    await ensureDir(voiceDir(v));
    await AsyncStorage.removeItem(readyKey(voiceId));
    await ensureEspeakData();
    await FileSystem.downloadAsync(hf(v, 'tokens.txt'), tokensPath(v));
    const dl = FileSystem.createDownloadResumable(
      hf(v, v.file),
      onnxPath(v),
      {},
      (p) => {
        if (p.totalBytesExpectedToWrite > 0) {
          onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
        }
      },
    );
    const res = await dl.downloadAsync();
    if (!res) throw new Error('download returned no result');
    await AsyncStorage.setItem(readyKey(voiceId), '1');
    onProgress?.(1);
    return true;
  } catch {
    return false;
  }
}

export async function removeVoice(voiceId: string): Promise<void> {
  const v = getVoice(voiceId);
  await AsyncStorage.removeItem(readyKey(voiceId));
  await FileSystem.deleteAsync(voiceDir(v), { idempotent: true });
}
