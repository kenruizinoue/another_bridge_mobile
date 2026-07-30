// On-device neural voice (Piper via sherpa-onnx), the "higher model" for
// speaking. Ported from another_interviewer's player: synthesis is
// decoupled from playback — a producer generates WAV segments as fast as
// it can while a consumer plays them in order, so generation stays ahead
// of speech and there are no mid-reply gaps once it starts.
import * as FileSystem from 'expo-file-system/legacy';
import TTSManager from 'react-native-sherpa-onnx-offline-tts';
import { expoFilePlayer } from './filePlayer';
import { getNeuralVoiceId } from './preference';
import { getVoicePaths, isVoiceReady } from './neural/neuralModel';
import type { PlayFile } from './remoteSpeaker';
import type { SpeakOptions, Speaker, SpeakResult } from './types';

type TtsEngineNative = {
  initialize(config: string): Promise<unknown>;
  deinitialize(): void;
  generateAndSave(text: string, path: string, format: string): Promise<string>;
};

export type NeuralSpeakerDeps = {
  tts?: TtsEngineNative;
  play?: PlayFile;
  isReady?: (voiceId: string) => Promise<boolean>;
  paths?: (voiceId: string) => { modelPath: string; tokensPath: string; dataDirPath: string };
  getVoiceId?: () => Promise<string>;
  ensureCacheDir?: () => Promise<string>;
};

const CACHE = `${FileSystem.cacheDirectory ?? ''}tts-seg/`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toUri = (p: string) => (p.startsWith('file://') ? p : `file://${p}`);
const toPath = (p: string) => p.replace(/^file:\/\//, '');

async function defaultEnsureCacheDir(): Promise<string> {
  const info = await FileSystem.getInfoAsync(CACHE);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE, { intermediates: true });
  }
  return CACHE;
}

/** Word caps per segment: the FIRST segment stays tiny so the first WAV is
 *  ready almost immediately (time-to-first-audio is the felt latency); the
 *  producer buffer covers the bigger later segments. */
export const FIRST_SEGMENT_MAX_WORDS = 8;
export const SEGMENT_MAX_WORDS = 28;

// Split at sentence AND clause boundaries, then merge greedily up to the
// per-segment cap. Clause-level splitting exists so a long opening sentence
// can still yield a short first segment; later segments merge clauses back
// into near-sentences under the 28-word cap.
export function segmentize(text: string): string[] {
  const parts = text.match(/[^.!?,;:]+[.!?,;:]+|[^.!?,;:]+$/g) ?? [text];
  const segs: string[] = [];
  let buf = '';
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    const cap = segs.length === 0 ? FIRST_SEGMENT_MAX_WORDS : SEGMENT_MAX_WORDS;
    const merged = buf ? `${buf} ${s}` : s;
    if (buf && merged.split(/\s+/).length > cap) {
      segs.push(buf);
      buf = s;
    } else {
      buf = merged;
    }
  }
  if (buf) segs.push(buf);
  return segs;
}

export function createNeuralSpeaker(deps: NeuralSpeakerDeps = {}): Speaker {
  const tts = deps.tts ?? (TTSManager as TtsEngineNative);
  const play = deps.play ?? expoFilePlayer;
  const isReady = deps.isReady ?? isVoiceReady;
  const paths = deps.paths ?? getVoicePaths;
  const getVoiceId = deps.getVoiceId ?? getNeuralVoiceId;
  const ensureCacheDir = deps.ensureCacheDir ?? defaultEnsureCacheDir;

  let initedVoiceId: string | null = null;
  let stopFlag = false;
  let runSeq = 0;
  let currentStop: (() => void) | null = null;

  // (Re)initialize the engine when nothing is loaded or the voice changed.
  const ensureEngine = async (voiceId: string): Promise<void> => {
    if (initedVoiceId === voiceId) return;
    if (initedVoiceId !== null) {
      try {
        tts.deinitialize();
      } catch {
        // nothing to tear down
      }
    }
    await tts.initialize(JSON.stringify(paths(voiceId)));
    initedVoiceId = voiceId;
  };

  return {
    /** Load the voice model ahead of the first reply (entering
     *  conversation mode) so the first speak skips the init cost. */
    async prewarm(): Promise<void> {
      try {
        const voiceId = await getVoiceId();
        if (!(await isReady(voiceId))) return;
        await ensureEngine(voiceId);
      } catch {
        initedVoiceId = null; // a failed warmup must not poison speak()
      }
    },

    async speak(text: string, _options?: SpeakOptions): Promise<SpeakResult> {
      if (!text.trim()) return 'done';
      const voiceId = await getVoiceId();
      // Not downloaded yet → error so the router falls back to the
      // device voice instead of leaving the conversation silent.
      if (!(await isReady(voiceId))) return 'error';

      stopFlag = false;
      const runId = ++runSeq;
      try {
        await ensureEngine(voiceId);
        const cache = await ensureCacheDir();

        const segs = segmentize(text);
        const ready: (string | undefined)[] = new Array(segs.length);
        let genError = false;

        // Producer: synthesize every segment to its own WAV, running
        // ahead of playback (generateAndSave runs off-thread natively).
        const producer = (async () => {
          for (let i = 0; i < segs.length; i += 1) {
            if (stopFlag) return;
            try {
              const path = await tts.generateAndSave(
                segs[i],
                `${toPath(cache)}r${runId}-${i}.wav`,
                'wav',
              );
              ready[i] = toUri(path);
            } catch {
              genError = true;
              return;
            }
          }
        })();

        // Consumer: play buffered segments in order.
        let started = false;
        for (let i = 0; i < segs.length; i += 1) {
          while (!stopFlag && ready[i] === undefined && !genError) {
            await sleep(80);
          }
          if (stopFlag) break;
          const uri = ready[i];
          if (uri === undefined) break;
          started = true;
          const finished = await new Promise<SpeakResult>((resolve) => {
            const handle = play(uri, resolve);
            currentStop = () => handle.stop();
          });
          currentStop = null;
          if (finished === 'stopped' || stopFlag) {
            await producer.catch(() => {});
            return 'stopped';
          }
        }
        await producer.catch(() => {});

        if (stopFlag) return 'stopped';
        // Nothing spoken at all → let the router fall back; a partial
        // read still counts as done (falling back would repeat it).
        return started ? 'done' : 'error';
      } catch {
        initedVoiceId = null;
        return 'error';
      }
    },

    stop(): void {
      stopFlag = true;
      currentStop?.();
    },
  };
}
