import { AudioModule, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getVoiceLanguage } from '../lib/transcription/preference';
import { configureRecordingAudioSession, WAV_16K_MONO } from '../lib/transcription/recording';
import { transcriptionRouter } from '../lib/transcription/router';

export type VoiceStatus = 'idle' | 'recording' | 'transcribing';

// Hard cap per dictation — recording auto-stops and transcribes at this
// point, keeping clips within what every engine handles comfortably
// (Apple's on-device recognizer gets a 120s processing timeout).
export const MAX_RECORDING_MS = 180_000; // 3 min

/**
 * Dictation for the composer, WhatsApp-style: tap the mic to record, tap
 * stop to transcribe. The transcript is handed to `onText` for the DRAFT
 * only — nothing is ever auto-sent. Engine choice + fallback live in
 * lib/transcription (Apple on device by default, then Whisper/OpenAI).
 */
export default function useVoiceInput({
  onText,
  onError,
}: {
  onText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const recorder = useAudioRecorder(WAV_16K_MONO);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const busyRef = useRef(false); // guards double-taps mid async transition
  const recordingRef = useRef(false); // truth for the cap timer, not stale state
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCapTimer = useCallback(() => {
    if (capTimerRef.current !== null) {
      clearTimeout(capTimerRef.current);
      capTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearCapTimer, [clearCapTimer]);

  const stop = useCallback(async () => {
    if (busyRef.current || !recordingRef.current) return;
    busyRef.current = true;
    recordingRef.current = false;
    clearCapTimer();
    setStatus('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        onError('Nothing was recorded.');
        return;
      }
      // Explicit language (settings) → engines never auto-detect.
      const language = await getVoiceLanguage();
      const { text } = await transcriptionRouter.transcribe(uri, { language });
      if (text) onText(text);
      else onError('Transcription failed. Try another engine in settings.');
    } catch {
      onError('Transcription failed.');
    } finally {
      busyRef.current = false;
      setStatus('idle');
    }
  }, [recorder, onText, onError, clearCapTimer]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError('Microphone permission denied. Enable it in iOS Settings.');
        return;
      }
      await configureRecordingAudioSession();
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setStatus('recording');
      // Auto-stop at the cap; stop() no-ops if the user already stopped.
      clearCapTimer();
      capTimerRef.current = setTimeout(() => {
        void stop();
      }, MAX_RECORDING_MS);
    } catch {
      onError('Could not start recording.');
    } finally {
      busyRef.current = false;
    }
  }, [recorder, onError, stop, clearCapTimer]);

  // One button: idle → record, recording → stop+transcribe. Taps while
  // transcribing are ignored.
  const toggle = useCallback(() => {
    if (status === 'recording') void stop();
    else if (status === 'idle') void start();
  }, [status, start, stop]);

  return { status, toggle };
}
