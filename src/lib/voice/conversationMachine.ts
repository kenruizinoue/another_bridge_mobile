// The turn-based conversation loop as a pure state machine. Every event
// returns the effects the binding layer must perform (start or stop the
// capture, send, speak), so the whole flow is unit-testable without React,
// timers, or native modules. The hook (useVoiceConversation) owns those
// side effects and the timers that feed events in.

export type ConversationState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'confirming'
  | 'waitingReply'
  | 'speaking';

export type ConversationEffect =
  | { kind: 'startCapture' }
  | { kind: 'stopCapture' } // stop the recorder and transcribe the clip
  | { kind: 'abortCapture' } // stop and discard, no transcription
  | { kind: 'send'; text: string }
  | { kind: 'speak'; text: string }
  | { kind: 'stopSpeech' };

export function createConversationMachine() {
  let state: ConversationState = 'idle';
  let pendingTranscript: string | null = null;

  return {
    state: (): ConversationState => state,
    /** The transcript shown during the confirm window, if any. */
    transcript: (): string | null => pendingTranscript,

    start(): ConversationEffect[] {
      if (state !== 'idle') return [];
      state = 'listening';
      return [{ kind: 'startCapture' }];
    },

    stop(): ConversationEffect[] {
      const effects: ConversationEffect[] =
        state === 'listening'
          ? [{ kind: 'abortCapture' }]
          : state === 'speaking'
            ? [{ kind: 'stopSpeech' }]
            : [];
      state = 'idle';
      pendingTranscript = null;
      return effects;
    },

    /** The silence detector saw the spoken turn end. */
    onEndOfSpeech(): ConversationEffect[] {
      if (state !== 'listening') return [];
      state = 'transcribing';
      return [{ kind: 'stopCapture' }];
    },

    /** The silence detector gave up waiting for any speech. */
    onNoSpeech(): ConversationEffect[] {
      if (state !== 'listening') return [];
      return [{ kind: 'abortCapture' }, { kind: 'startCapture' }];
    },

    /** Transcription finished; blank results re-listen instead of sending. */
    onTranscript(text: string | null): ConversationEffect[] {
      if (state !== 'transcribing') return [];
      const cleaned = text?.trim() ?? '';
      if (!cleaned) {
        state = 'listening';
        return [{ kind: 'startCapture' }];
      }
      state = 'confirming';
      pendingTranscript = cleaned;
      return [];
    },

    /** The cancel window ran out: commit the send. */
    onConfirmElapsed(): ConversationEffect[] {
      if (state !== 'confirming' || pendingTranscript === null) return [];
      const text = pendingTranscript;
      pendingTranscript = null;
      state = 'waitingReply';
      return [{ kind: 'send', text }];
    },

    /** User rejected the transcript: retake the turn. */
    cancelConfirm(): ConversationEffect[] {
      if (state !== 'confirming') return [];
      pendingTranscript = null;
      state = 'listening';
      return [{ kind: 'startCapture' }];
    },

    /** The reply landed; speak its spoken summary. */
    onReplyReady(speechText: string): ConversationEffect[] {
      if (state !== 'waitingReply') return [];
      state = 'speaking';
      return [{ kind: 'speak', text: speechText }];
    },

    /** Playback finished naturally. */
    onSpeechEnded(): ConversationEffect[] {
      if (state !== 'speaking') return [];
      state = 'listening';
      return [{ kind: 'startCapture' }];
    },

    /** Tap while speaking: cut the voice and take the turn. */
    interrupt(): ConversationEffect[] {
      if (state !== 'speaking') return [];
      state = 'listening';
      return [{ kind: 'stopSpeech' }, { kind: 'startCapture' }];
    },

    /** Barge-in: the monitor capture heard the user talk over the voice,
     *  either during playback (speaking) or while the reply is still
     *  generating and being read live (waitingReply). Unlike interrupt(),
     *  the capture is ALREADY running (it detected the speech), so only
     *  the audio output is cut; a turn still running on the Mac keeps
     *  running and the user's new message queues behind it. */
    onBargeInSpeech(): ConversationEffect[] {
      if (state !== 'speaking' && state !== 'waitingReply') return [];
      state = 'listening';
      return [{ kind: 'stopSpeech' }];
    },
  };
}
