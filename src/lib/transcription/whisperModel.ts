import * as FileSystem from 'expo-file-system/legacy';

export type WhisperModelState = 'unknown' | 'not-downloaded' | 'downloading' | 'ready' | 'error';

/** File operations the Whisper model manager needs; injectable for tests. */
export interface ModelFiles {
  readonly modelPath: string;
  exists(path: string): Promise<boolean>;
  download(url: string, path: string, onProgress?: (fraction: number) => void): Promise<boolean>;
  remove(path: string): Promise<void>;
}

// Whisper small, MULTILINGUAL — same size/accuracy tier as the small.en
// another_interviewer ships, but it also handles Spanish (the settings
// sheet offers English/Spanish and the language is passed explicitly,
// never auto-detected).
const MODEL_FILE = 'ggml-small.bin';
export const WHISPER_MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILE}`;
export const WHISPER_MODEL_SIZE_MB = 466;

const DIR = `${FileSystem.documentDirectory ?? ''}whisper/`;

/** Concrete ModelFiles backed by expo-file-system (legacy API). */
export const expoModelFiles: ModelFiles = {
  modelPath: `${DIR}${MODEL_FILE}`,

  async exists(path: string): Promise<boolean> {
    return (await FileSystem.getInfoAsync(path)).exists;
  },

  async download(
    url: string,
    path: string,
    onProgress?: (fraction: number) => void,
  ): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    }
    const resumable = FileSystem.createDownloadResumable(url, path, {}, (progress) => {
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
      }
    });
    const result = await resumable.downloadAsync();
    return result?.status === 200;
  },

  async remove(path: string): Promise<void> {
    await FileSystem.deleteAsync(path, { idempotent: true });
  },
};

/**
 * Manages the on-device Whisper model file: whether it is present,
 * downloading it once with progress, and removing it. A download failure
 * leaves the state 'error' and isReady false so the router falls back to
 * another engine.
 */
export class WhisperModel {
  private state: WhisperModelState = 'unknown';

  constructor(
    private readonly files: ModelFiles,
    private readonly url: string = WHISPER_MODEL_URL,
  ) {}

  get path(): string {
    return this.files.modelPath;
  }

  getState(): WhisperModelState {
    return this.state;
  }

  async isReady(): Promise<boolean> {
    if (this.state === 'ready') return true;
    const exists = await this.files.exists(this.files.modelPath);
    this.state = exists ? 'ready' : 'not-downloaded';
    return exists;
  }

  async ensureReady(onProgress?: (fraction: number) => void): Promise<boolean> {
    if (await this.isReady()) return true;
    this.state = 'downloading';
    try {
      const ok = await this.files.download(this.url, this.files.modelPath, onProgress);
      this.state = ok ? 'ready' : 'error';
      return ok;
    } catch {
      this.state = 'error';
      return false;
    }
  }

  async remove(): Promise<void> {
    await this.files.remove(this.files.modelPath);
    this.state = 'not-downloaded';
  }
}

// App-wide singleton — the settings sheet drives downloads through the
// same instance the transcriber checks, so state stays consistent.
export const whisperModel = new WhisperModel(expoModelFiles);
