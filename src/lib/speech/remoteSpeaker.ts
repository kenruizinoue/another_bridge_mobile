// Speaker over a remote synthesizer: fetch the audio to a local file,
// then play it. The synthesize and play halves are injected so bridge
// and OpenAI engines share this shell and tests never touch native code.
import type { SpeakOptions, Speaker, SpeakResult } from './types';

export type Synthesize = (text: string, options?: SpeakOptions) => Promise<string | null>;

export type PlayHandle = { stop: () => void };
export type PlayFile = (uri: string, onFinish: (result: SpeakResult) => void) => PlayHandle;

export function createRemoteSpeaker(synthesize: Synthesize, play: PlayFile): Speaker {
  let current: PlayHandle | null = null;
  let stopped = false;

  return {
    async speak(text: string, options?: SpeakOptions): Promise<SpeakResult> {
      if (!text.trim()) return 'done';
      stopped = false;
      const uri = await synthesize(text, options);
      if (uri === null) return 'error';
      if (stopped) return 'stopped'; // stop() landed during synthesis
      return new Promise<SpeakResult>((resolve) => {
        current = play(uri, (result) => {
          current = null;
          resolve(result);
        });
      });
    },

    stop(): void {
      stopped = true;
      current?.stop();
    },
  };
}
