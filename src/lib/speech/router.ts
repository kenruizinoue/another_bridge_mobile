// Routes speech to the preferred engine with fallback to the on-device
// voice, mirroring the transcription router: a remote engine that errors
// never leaves the conversation silent.
import { expoSpeaker } from './expoSpeaker';
import { expoFilePlayer } from './filePlayer';
import { createNeuralSpeaker } from './neuralSpeaker';
import { getSpeechEngine, type SpeechEngine } from './preference';
import { createRemoteSpeaker } from './remoteSpeaker';
import { createBridgeSynthesizer, createOpenAiSynthesizer } from './synthesizers';
import type { SpeakOptions, Speaker, SpeakResult } from './types';

export type SpeechRouterDeps = {
  engines: Record<SpeechEngine, Speaker>;
  getPreference: () => Promise<SpeechEngine>;
};

export function createSpeechRouter(deps: SpeechRouterDeps): Speaker {
  let active: Speaker | null = null;

  return {
    async speak(text: string, options?: SpeakOptions): Promise<SpeakResult> {
      const preferred = await deps.getPreference();
      const order: SpeechEngine[] = preferred === 'device' ? ['device'] : [preferred, 'device'];
      for (const engine of order) {
        const speaker = deps.engines[engine];
        active = speaker;
        const result = await speaker.speak(text, options);
        if (result !== 'error') return result;
      }
      return 'error';
    },

    stop(): void {
      active?.stop();
    },

    async prewarm(): Promise<void> {
      const preferred = await deps.getPreference();
      await deps.engines[preferred].prewarm?.();
    },
  };
}

// App-wide default router wired to the real engines.
export const speechRouter: Speaker = createSpeechRouter({
  engines: {
    device: expoSpeaker,
    neural: createNeuralSpeaker(),
    bridge: createRemoteSpeaker(createBridgeSynthesizer(), expoFilePlayer),
    openai: createRemoteSpeaker(createOpenAiSynthesizer(), expoFilePlayer),
  },
  getPreference: getSpeechEngine,
});
