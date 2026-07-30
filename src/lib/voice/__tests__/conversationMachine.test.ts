import { createConversationMachine } from '../conversationMachine';

it('start opens a capture and stop from listening aborts it', () => {
  const m = createConversationMachine();
  expect(m.state()).toBe('idle');
  expect(m.start()).toEqual([{ kind: 'startCapture' }]);
  expect(m.state()).toBe('listening');
  expect(m.stop()).toEqual([{ kind: 'abortCapture' }]);
  expect(m.state()).toBe('idle');
});

it('end of speech stops the capture and moves to transcribing', () => {
  const m = createConversationMachine();
  m.start();
  expect(m.onEndOfSpeech()).toEqual([{ kind: 'stopCapture' }]);
  expect(m.state()).toBe('transcribing');
});

it('no speech keeps the loop alive with a fresh capture', () => {
  const m = createConversationMachine();
  m.start();
  expect(m.onNoSpeech()).toEqual([{ kind: 'abortCapture' }, { kind: 'startCapture' }]);
  expect(m.state()).toBe('listening');
});

it('a transcript enters the confirm window; elapse sends it', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  expect(m.onTranscript('run the tests')).toEqual([]);
  expect(m.state()).toBe('confirming');
  expect(m.transcript()).toBe('run the tests');
  expect(m.onConfirmElapsed()).toEqual([{ kind: 'send', text: 'run the tests' }]);
  expect(m.state()).toBe('waitingReply');
  expect(m.transcript()).toBeNull();
});

it('cancel during the confirm window retakes the turn instead of sending', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  m.onTranscript('garbage from the tv');
  expect(m.cancelConfirm()).toEqual([{ kind: 'startCapture' }]);
  expect(m.state()).toBe('listening');
  expect(m.transcript()).toBeNull();
});

it('a blank transcript never auto-sends, it re-listens', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  expect(m.onTranscript('   ')).toEqual([{ kind: 'startCapture' }]);
  expect(m.state()).toBe('listening');
  expect(m.onEndOfSpeech()).toEqual([{ kind: 'stopCapture' }]);
  expect(m.onTranscript(null)).toEqual([{ kind: 'startCapture' }]);
  expect(m.state()).toBe('listening');
});

it('a ready reply is spoken, then the mic reopens', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  m.onTranscript('hello');
  m.onConfirmElapsed();
  expect(m.onReplyReady('done, on screen')).toEqual([{ kind: 'speak', text: 'done, on screen' }]);
  expect(m.state()).toBe('speaking');
  expect(m.onSpeechEnded()).toEqual([{ kind: 'startCapture' }]);
  expect(m.state()).toBe('listening');
});

it('tap while speaking interrupts the speech and opens the mic', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  m.onTranscript('hello');
  m.onConfirmElapsed();
  m.onReplyReady('a long spoken reply');
  expect(m.interrupt()).toEqual([{ kind: 'stopSpeech' }, { kind: 'startCapture' }]);
  expect(m.state()).toBe('listening');
  // The stopped speech's late onSpeechEnded must not double-start capture.
  expect(m.onSpeechEnded()).toEqual([]);
});

it('stop cleans up from every state', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  expect(m.stop()).toEqual([]); // transcribing: nothing to clean, result is dropped
  expect(m.state()).toBe('idle');

  m.start();
  m.onEndOfSpeech();
  m.onTranscript('pending');
  expect(m.stop()).toEqual([]); // confirming: discard, nothing sent
  expect(m.state()).toBe('idle');

  m.start();
  m.onEndOfSpeech();
  m.onTranscript('hi');
  m.onConfirmElapsed();
  expect(m.stop()).toEqual([]); // waitingReply: turn keeps running server-side
  m.start();
  m.onEndOfSpeech();
  m.onTranscript('hi');
  m.onConfirmElapsed();
  m.onReplyReady('speaking now');
  expect(m.stop()).toEqual([{ kind: 'stopSpeech' }]);
  expect(m.state()).toBe('idle');
});

it('a transcript arriving after stop is dropped, not sent', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  m.stop();
  expect(m.onTranscript('too late')).toEqual([]);
  expect(m.state()).toBe('idle');
});

it('events in the wrong state are no-ops', () => {
  const m = createConversationMachine();
  expect(m.onEndOfSpeech()).toEqual([]);
  expect(m.onConfirmElapsed()).toEqual([]);
  expect(m.onReplyReady('x')).toEqual([]);
  expect(m.onSpeechEnded()).toEqual([]);
  expect(m.interrupt()).toEqual([]);
  m.start();
  expect(m.start()).toEqual([]); // already on
  expect(m.onConfirmElapsed()).toEqual([]);
});

it('barge-in cuts only the speech, the running capture becomes the turn', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  m.onTranscript('hello');
  m.onConfirmElapsed();
  m.onReplyReady('long spoken reply');
  expect(m.onBargeInSpeech()).toEqual([{ kind: 'stopSpeech' }]);
  expect(m.state()).toBe('listening');
  // The now-listening capture ends normally and transcribes.
  expect(m.onEndOfSpeech()).toEqual([{ kind: 'stopCapture' }]);
  // The stopped playback's late callback must not bounce the state.
  expect(m.onSpeechEnded()).toEqual([]);
});

it('barge-in outside speaking is a no-op', () => {
  const m = createConversationMachine();
  expect(m.onBargeInSpeech()).toEqual([]);
  m.start();
  expect(m.onBargeInSpeech()).toEqual([]);
});

it('barge-in also works while the reply is still generating', () => {
  const m = createConversationMachine();
  m.start();
  m.onEndOfSpeech();
  m.onTranscript('hello');
  m.onConfirmElapsed();
  expect(m.state()).toBe('waitingReply');
  expect(m.onBargeInSpeech()).toEqual([{ kind: 'stopSpeech' }]);
  expect(m.state()).toBe('listening');
  // The interrupted turn's late reply-ready must not hijack the new turn.
  expect(m.onReplyReady('late summary')).toEqual([]);
});
