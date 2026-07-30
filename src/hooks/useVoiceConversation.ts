import { AudioModule, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speechRouter } from '../lib/speech/router';
import type { Speaker } from '../lib/speech/types';
import { getVoiceLanguage } from '../lib/transcription/preference';
import {
  configureBargeInAudioSession,
  configureRecordingAudioSession,
  WAV_16K_MONO_METERED,
} from '../lib/transcription/recording';
import { transcriptionRouter } from '../lib/transcription/router';
import type { TranscribeOptions } from '../lib/transcription/types';
import {
  createConversationMachine,
  type ConversationEffect,
  type ConversationState,
} from '../lib/voice/conversationMachine';
import { getBargeInEnabled } from '../lib/voice/preference';
import { createSilenceDetector } from '../lib/voice/silenceDetector';
import { createStreamReader } from '../lib/voice/streamReader';
import { MAX_RECORDING_MS } from './useVoiceInput';

/** How long the transcript stays cancellable before it auto-sends. */
export const CONFIRM_WINDOW_MS = 2000;
/** Metering poll cadence while listening. */
export const METER_INTERVAL_MS = 150;

export type VoiceConversationDeps = {
  transcribe?: (uri: string, options?: TranscribeOptions) => Promise<{ text: string | null }>;
  speaker?: Speaker;
  createDetector?: typeof createSilenceDetector;
  confirmWindowMs?: number;
  meterIntervalMs?: number;
  /** Whether barge-in (talk over the reply to cut it) is enabled. */
  getBargeIn?: () => Promise<boolean>;
};

/**
 * Hands-free conversation loop: listen, auto-cut on silence, transcribe,
 * auto-send after a short cancel window, then speak the reply's spoken
 * summary and reopen the mic. All decisions live in the pure machine
 * (lib/voice/conversationMachine); this hook only performs its effects.
 * The screen supplies `onSend` (sending stays in useChatSession) and calls
 * `notifyReply` when a finished reply is ready to speak.
 */
export default function useVoiceConversation(
  {
    onSend,
    onError,
  }: {
    onSend: (text: string) => void;
    onError: (message: string) => void;
  },
  deps: VoiceConversationDeps = {},
) {
  const transcribe = deps.transcribe ?? ((uri, o) => transcriptionRouter.transcribe(uri, o));
  const speaker = deps.speaker ?? speechRouter;
  const confirmWindowMs = deps.confirmWindowMs ?? CONFIRM_WINDOW_MS;
  const meterIntervalMs = deps.meterIntervalMs ?? METER_INTERVAL_MS;
  const getBargeIn = deps.getBargeIn ?? getBargeInEnabled;

  const recorder = useAudioRecorder(WAV_16K_MONO_METERED);
  const machineRef = useRef<ReturnType<typeof createConversationMachine> | null>(null);
  if (machineRef.current === null) machineRef.current = createConversationMachine();
  const machine = machineRef.current;

  const detectorRef = useRef((deps.createDetector ?? createSilenceDetector)());
  const [state, setState] = useState<ConversationState>('idle');
  const [transcript, setTranscript] = useState<string | null>(null);

  // Reads the reply aloud WHILE it streams (sentence by sentence), so
  // speech starts with the first sentence instead of after the turn.
  const readerRef = useRef(
    createStreamReader(async (sentence) => {
      const language = await getVoiceLanguage();
      return speaker.speak(sentence, { language });
    }),
  );

  const meterTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCaptureTimers = useCallback(() => {
    if (meterTimer.current) {
      clearInterval(meterTimer.current);
      meterTimer.current = null;
    }
    if (capTimer.current) {
      clearTimeout(capTimer.current);
      capTimer.current = null;
    }
  }, []);

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimer.current) {
      clearTimeout(confirmTimer.current);
      confirmTimer.current = null;
    }
  }, []);

  const syncUi = useCallback(() => {
    setState(machine.state());
    setTranscript(machine.transcript());
  }, [machine]);

  // Effects are executed in order; each may feed new events (and therefore
  // new effects) back into the machine via the run() helpers below.
  const runEffects = useCallback(
    (effects: ConversationEffect[]) => {
      for (const effect of effects) {
        switch (effect.kind) {
          case 'startCapture':
            void startCaptureRef.current();
            break;
          case 'stopCapture':
            void stopCaptureRef.current(true);
            break;
          case 'abortCapture':
            void stopCaptureRef.current(false);
            break;
          case 'send':
            onSend(effect.text);
            // Keep the mic open while the reply generates so talking
            // over the live reading (or the thinking silence) barges in.
            void (async () => {
              if (await getBargeIn()) void startCaptureRef.current(true);
            })();
            break;
          case 'speak':
            void speakRef.current(effect.text);
            break;
          case 'stopSpeech':
            readerRef.current.cancel();
            speaker.stop();
            break;
        }
      }
      syncUi();
    },
    [onSend, speaker, syncUi],
  );

  // Ref-indirection so runEffects, the capture routines, and the machine
  // can reference each other without hook-order gymnastics.
  const startCaptureRef = useRef<(monitor?: boolean) => Promise<void>>(async () => {});
  const stopCaptureRef = useRef<(transcribeClip: boolean) => Promise<void>>(async () => {});
  const speakRef = useRef<(text: string) => Promise<void>>(async () => {});
  const capturingRef = useRef(false);

  startCaptureRef.current = async (monitor = false) => {
    // A barge-in monitor is already recording when the machine asks to
    // "start" listening after playback — reuse it, fresh detector window.
    if (capturingRef.current) {
      detectorRef.current.reset();
      return;
    }
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError('Microphone permission denied. Enable it in iOS Settings.');
        runEffects(machine.stop());
        return;
      }
      // Monitor captures must coexist with the playing reply.
      if (monitor) await configureBargeInAudioSession();
      else await configureRecordingAudioSession();
      await recorder.prepareToRecordAsync();
      recorder.record();
      capturingRef.current = true;
      detectorRef.current.reset();
      clearCaptureTimers();
      meterTimer.current = setInterval(() => {
        const status = recorder.getStatus();
        const event = detectorRef.current.push(status.metering, Date.now());
        const current = machine.state();
        if (event === 'speech-started' && (current === 'speaking' || current === 'waitingReply')) {
          runEffects(machine.onBargeInSpeech());
        } else if (event === 'end-of-speech') runEffects(machine.onEndOfSpeech());
        else if (event === 'no-speech-timeout') {
          if (current === 'listening') runEffects(machine.onNoSpeech());
          // Monitoring a long-running turn: never give up, keep watching.
          else detectorRef.current.reset();
        }
      }, meterIntervalMs);
      // Hard cap: treat an endless turn as end-of-speech, same as dictation.
      capTimer.current = setTimeout(() => {
        runEffects(machine.onEndOfSpeech());
      }, MAX_RECORDING_MS);
    } catch {
      onError('Could not start listening.');
      runEffects(machine.stop());
    }
  };

  stopCaptureRef.current = async (transcribeClip: boolean) => {
    clearCaptureTimers();
    capturingRef.current = false;
    try {
      await recorder.stop();
      if (!transcribeClip) return;
      const uri = recorder.uri;
      if (!uri) {
        runEffects(machine.onTranscript(null));
        return;
      }
      const language = await getVoiceLanguage();
      const { text } = await transcribe(uri, { language });
      runEffects(machine.onTranscript(text));
    } catch {
      if (transcribeClip) runEffects(machine.onTranscript(null));
    }
  };

  speakRef.current = async (text: string) => {
    // Empty speech = the reply was already read aloud while streaming;
    // advance the loop without touching the engine.
    if (!text.trim()) {
      runEffects(machine.onSpeechEnded());
      return;
    }
    // Barge-in (default off, device validation pending): open the mic as
    // a monitor BEFORE speaking so talking over the reply cuts it.
    if (await getBargeIn()) void startCaptureRef.current(true);
    const language = await getVoiceLanguage();
    const result = await speaker.speak(text, { language });
    // 'stopped' means interrupt()/barge-in already transitioned the machine.
    if (result !== 'stopped') runEffects(machine.onSpeechEnded());
  };

  // The confirm window: armed whenever the machine sits in confirming.
  useEffect(() => {
    if (state !== 'confirming') {
      clearConfirmTimer();
      return;
    }
    confirmTimer.current = setTimeout(() => {
      runEffects(machine.onConfirmElapsed());
    }, confirmWindowMs);
    return clearConfirmTimer;
  }, [state, confirmWindowMs, machine, runEffects, clearConfirmTimer]);

  const toggle = useCallback(() => {
    if (machine.state() === 'idle') {
      // Warm the speech engine (neural model load) while the user is
      // still talking, so the first reply starts speaking immediately.
      void speaker.prewarm?.();
      runEffects(machine.start());
    } else {
      clearConfirmTimer();
      readerRef.current.cancel();
      runEffects(machine.stop());
    }
  }, [machine, runEffects, clearConfirmTimer, speaker]);

  /** Tap during speech: cut the voice and take the turn. While the reply
   *  is still generating (waitingReply) this silences the live reading;
   *  the turn keeps running on the Mac. */
  const interrupt = useCallback(() => {
    if (machine.state() === 'waitingReply') {
      readerRef.current.cancel();
      speaker.stop();
      return;
    }
    runEffects(machine.interrupt());
  }, [machine, runEffects, speaker]);

  /** Feed the live stream text; new complete sentences are spoken. */
  const readStream = useCallback(
    (fullText: string) => {
      if (machine.state() === 'waitingReply' && fullText) {
        readerRef.current.update(fullText);
      }
    },
    [machine],
  );

  /** Reject the pending transcript and retake the turn. */
  const cancel = useCallback(() => {
    clearConfirmTimer();
    runEffects(machine.cancelConfirm());
  }, [machine, runEffects, clearConfirmTimer]);

  /** The screen calls this when a finished reply's spoken text is ready.
   *  If the live reader already spoke the reply, the summary is skipped
   *  (speaking it again would repeat everything); we wait for the reading
   *  queue to finish, then advance the loop with a silent speak. */
  const notifyReply = useCallback(
    (speechText: string) => {
      const reader = readerRef.current;
      void (async () => {
        await reader.drain();
        // Skip the summary when the reply was already read aloud, or the
        // user explicitly silenced this turn's reading.
        const finalSpeech = reader.spoke() || reader.wasCancelled() ? '' : speechText;
        reader.reset();
        runEffects(machine.onReplyReady(finalSpeech));
      })();
    },
    [machine, runEffects],
  );

  // Leaving the screen mid-conversation: stop everything.
  useEffect(
    () => () => {
      clearCaptureTimers();
      clearConfirmTimer();
      speaker.stop();
    },
    [clearCaptureTimers, clearConfirmTimer, speaker],
  );

  return {
    state,
    transcript,
    active: state !== 'idle',
    toggle,
    interrupt,
    cancel,
    notifyReply,
    readStream,
  };
}
