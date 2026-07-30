import { act, renderHook } from '@testing-library/react-native';
import { useAudioRecorder } from 'expo-audio';
import type { Speaker } from '../../lib/speech/types';
import useVoiceConversation from '../useVoiceConversation';

jest.useFakeTimers();

// A detector we script from the outside: each push() returns the next
// queued event (or null), so tests decide when speech starts and ends.
function scriptedDetector() {
  const queue: (
    | 'speech-started'
    | 'end-of-speech'
    | 'no-speech-timeout'
    | null
  )[] = [];
  return {
    queue,
    detector: {
      push: jest.fn(() => queue.shift() ?? null),
      reset: jest.fn(),
    },
  };
}

function fakeRecorder() {
  return {
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(),
    stop: jest.fn(async () => {}),
    getStatus: jest.fn(() => ({ isRecording: true, durationMillis: 0, metering: -20 })),
    uri: 'file://clip.wav',
  };
}

function fakeSpeaker(): Speaker & { resolveSpeak: (r: 'done' | 'stopped' | 'error') => void } {
  let resolver: ((r: 'done' | 'stopped' | 'error') => void) | null = null;
  return {
    speak: jest.fn(
      () =>
        new Promise<'done' | 'stopped' | 'error'>((resolve) => {
          resolver = resolve;
        }),
    ),
    stop: jest.fn(),
    resolveSpeak: (r) => resolver?.(r),
  };
}

async function flush() {
  // Drain pending microtasks queued by the async capture routines.
  await act(async () => {});
}

async function setup({
  transcribeText = 'hello there',
  bargeIn = false,
}: {
  transcribeText?: string | null;
  bargeIn?: boolean;
} = {}) {
  const recorder = fakeRecorder();
  (useAudioRecorder as jest.Mock).mockReturnValue(recorder);
  const { queue, detector } = scriptedDetector();
  const speaker = fakeSpeaker();
  const onSend = jest.fn();
  const onError = jest.fn();
  const transcribe = jest.fn(async () => ({ text: transcribeText }));
  const hook = await renderHook(() =>
    useVoiceConversation(
      { onSend, onError },
      {
        transcribe,
        speaker,
        createDetector: () => detector,
        meterIntervalMs: 100,
        confirmWindowMs: 2000,
        getBargeIn: async () => bargeIn,
      },
    ),
  );
  return { hook, recorder, queue, detector, speaker, onSend, onError, transcribe };
}

afterEach(() => {
  jest.clearAllTimers();
});

it('toggle starts listening and polls the meter into the detector', async () => {
  const { hook, recorder, detector } = await setup();
  await act(async () => hook.result.current.toggle());
  await flush();
  expect(hook.result.current.state).toBe('listening');
  expect(recorder.record).toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(detector.push).toHaveBeenCalled();
});

it('end of speech transcribes, confirms, then auto-sends after the window', async () => {
  const { hook, queue, onSend, transcribe } = await setup();
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  expect(transcribe).toHaveBeenCalledWith('file://clip.wav', { language: 'en-US' });
  expect(hook.result.current.state).toBe('confirming');
  expect(hook.result.current.transcript).toBe('hello there');
  expect(onSend).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(onSend).toHaveBeenCalledWith('hello there');
  expect(hook.result.current.state).toBe('waitingReply');
});

it('cancel during the window retakes the turn without sending', async () => {
  const { hook, queue, onSend, recorder } = await setup();
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  await act(async () => hook.result.current.cancel());
  await flush();
  expect(onSend).not.toHaveBeenCalled();
  expect(hook.result.current.state).toBe('listening');
  expect(recorder.record).toHaveBeenCalledTimes(2);
});

it('a blank transcript re-listens instead of sending', async () => {
  const { hook, queue, onSend } = await setup({ transcribeText: null });
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  expect(onSend).not.toHaveBeenCalled();
  expect(hook.result.current.state).toBe('listening');
});

it('notifyReply speaks and reopens the mic when playback finishes', async () => {
  const { hook, queue, speaker, recorder } = await setup();
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await act(async () => hook.result.current.notifyReply('all done, on screen'));
  await flush();
  expect(speaker.speak).toHaveBeenCalledWith('all done, on screen', { language: 'en-US' });
  expect(hook.result.current.state).toBe('speaking');
  await act(async () => {
    speaker.resolveSpeak('done');
  });
  expect(hook.result.current.state).toBe('listening');
  expect(recorder.record).toHaveBeenCalledTimes(2);
});

it('interrupt during speech stops the voice and listens again', async () => {
  const { hook, queue, speaker } = await setup();
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await act(async () => hook.result.current.notifyReply('a long reply'));
  await flush();
  await act(async () => hook.result.current.interrupt());
  await flush();
  expect(speaker.stop).toHaveBeenCalled();
  expect(hook.result.current.state).toBe('listening');
  await act(async () => {
    speaker.resolveSpeak('stopped');
  });
  // The stopped playback must not bounce the state.
  expect(hook.result.current.state).toBe('listening');
});

it('toggle off mid-listen aborts the capture without transcribing', async () => {
  const { hook, recorder, transcribe } = await setup();
  await act(async () => hook.result.current.toggle());
  await flush();
  await act(async () => hook.result.current.toggle());
  await flush();
  expect(hook.result.current.state).toBe('idle');
  expect(recorder.stop).toHaveBeenCalled();
  expect(transcribe).not.toHaveBeenCalled();
});

it('no-speech timeout restarts the capture and stays hands-free', async () => {
  const { hook, queue, recorder } = await setup();
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('no-speech-timeout');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  expect(hook.result.current.state).toBe('listening');
  expect(recorder.record).toHaveBeenCalledTimes(2);
});

it('barge-in: talking over the reply cuts the voice and the capture becomes the turn', async () => {
  const { hook, queue, speaker, recorder, transcribe } = await setup({ bargeIn: true });
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await act(async () => hook.result.current.notifyReply('a long reply'));
  await flush();
  // The monitor capture opened while speaking (second record call).
  expect(hook.result.current.state).toBe('speaking');
  expect(recorder.record).toHaveBeenCalledTimes(2);

  // The user talks over the reply...
  queue.push('speech-started');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  expect(speaker.stop).toHaveBeenCalled();
  expect(hook.result.current.state).toBe('listening');

  // ...and finishes the sentence: the same capture transcribes.
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  expect(transcribe).toHaveBeenCalledTimes(2);
  await act(async () => {
    speaker.resolveSpeak('stopped');
  });
});

it('without barge-in the mic stays closed while speaking', async () => {
  const { hook, queue, recorder, speaker } = await setup({ bargeIn: false });
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await act(async () => hook.result.current.notifyReply('a reply'));
  await flush();
  expect(hook.result.current.state).toBe('speaking');
  // Only the initial listening capture — no monitor while speaking.
  expect(recorder.record).toHaveBeenCalledTimes(1);
  await act(async () => {
    speaker.resolveSpeak('done');
  });
});

it('streamed sentences are read aloud and the end summary is skipped', async () => {
  const { hook, queue, speaker, onSend } = await setup();
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(onSend).toHaveBeenCalled(); // now in waitingReply

  // The reply streams in; each completed sentence gets spoken.
  await act(async () => {
    hook.result.current.readStream('First sentence done.');
  });
  await act(async () => {
    speaker.resolveSpeak('done');
  });
  await flush();
  expect(speaker.speak).toHaveBeenCalledWith('First sentence done.', { language: 'en-US' });

  // Turn settles: the summary must NOT be spoken again; loop reopens mic.
  await act(async () => {
    hook.result.current.notifyReply('A summary that would repeat things.');
  });
  await flush();
  expect(speaker.speak).toHaveBeenCalledTimes(1);
  expect(hook.result.current.state).toBe('listening');
});

it('talking during the thinking/reading phase barges in and queues the next turn', async () => {
  const { hook, queue, speaker, recorder, transcribe } = await setup({ bargeIn: true });
  await act(async () => hook.result.current.toggle());
  await flush();
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await flush();
  // Monitor opened right after the send, during waitingReply.
  expect(hook.result.current.state).toBe('waitingReply');
  expect(recorder.record).toHaveBeenCalledTimes(2);

  // The user talks over the thinking silence / live reading...
  queue.push('speech-started');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  expect(speaker.stop).toHaveBeenCalled();
  expect(hook.result.current.state).toBe('listening');

  // ...and their sentence becomes the next transcript.
  queue.push('end-of-speech');
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  await flush();
  expect(transcribe).toHaveBeenCalledTimes(2);
});
