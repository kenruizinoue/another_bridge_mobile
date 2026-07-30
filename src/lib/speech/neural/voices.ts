/**
 * Selectable on-device neural voices (same experience as
 * another_interviewer). All are Piper VITS models at 22050 Hz and share the
 * bundled espeak-ng-data, so any of them is a drop-in — only the voice
 * `.onnx` + `tokens.txt` differ and download on demand from the public
 * Hugging Face mirror.
 */
export type NeuralVoice = {
  /** Stable id, also the on-disk subfolder name. */
  id: string;
  /** Shown in the picker. */
  label: string;
  /** Hugging Face repo under `csukuangfj`. */
  repo: string;
  /** The model file name inside that repo (and on disk). */
  file: string;
  /** Approx download size in MB (voice model only). */
  sizeMB: number;
  /** BCP-47 language the voice speaks. */
  language: 'en-US' | 'es-ES';
};

export const NEURAL_VOICES: NeuralVoice[] = [
  {
    id: 'lessac-high',
    label: 'Lessac (clear, high)',
    repo: 'vits-piper-en_US-lessac-high',
    file: 'en_US-lessac-high.onnx',
    sizeMB: 114,
    language: 'en-US',
  },
  {
    id: 'ryan-high',
    label: 'Ryan (male, high)',
    repo: 'vits-piper-en_US-ryan-high',
    file: 'en_US-ryan-high.onnx',
    sizeMB: 121,
    language: 'en-US',
  },
  {
    id: 'libritts',
    label: 'LibriTTS (natural)',
    repo: 'vits-piper-en_US-libritts_r-medium',
    file: 'en_US-libritts_r-medium.onnx',
    sizeMB: 79,
    language: 'en-US',
  },
  {
    id: 'hfc-female',
    label: 'HFC (female)',
    repo: 'vits-piper-en_US-hfc_female-medium',
    file: 'en_US-hfc_female-medium.onnx',
    sizeMB: 63,
    language: 'en-US',
  },
  {
    id: 'alan-gb',
    label: 'Alan (British male)',
    repo: 'vits-piper-en_GB-alan-medium',
    file: 'en_GB-alan-medium.onnx',
    sizeMB: 63,
    language: 'en-US',
  },
  {
    id: 'sharvard-es',
    label: 'Sharvard (Español)',
    repo: 'vits-piper-es_ES-sharvard-medium',
    file: 'es_ES-sharvard-medium.onnx',
    sizeMB: 64,
    language: 'es-ES',
  },
];

export const DEFAULT_VOICE_ID = 'lessac-high';

/** Look up a voice by id, falling back to the default if unknown. */
export function getVoice(id: string): NeuralVoice {
  return NEURAL_VOICES.find((v) => v.id === id) ?? NEURAL_VOICES[0];
}
