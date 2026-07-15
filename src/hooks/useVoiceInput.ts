import { AudioModule, useAudioRecorder } from 'expo-audio';
import { useCallback, useRef, useState } from 'react';
import { getVoiceLanguage } from '../lib/transcription/preference';
import { configureRecordingAudioSession, WAV_16K_MONO } from '../lib/transcription/recording';
import { transcriptionRouter } from '../lib/transcription/router';

export type VoiceStatus = 'idle' | 'recording' | 'transcribing';

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
      setStatus('recording');
    } catch {
      onError('Could not start recording.');
    } finally {
      busyRef.current = false;
    }
  }, [recorder, onError]);

  const stop = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
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
  }, [recorder, onText, onError]);

  // One button: idle → record, recording → stop+transcribe. Taps while
  // transcribing are ignored.
  const toggle = useCallback(() => {
    if (status === 'recording') void stop();
    else if (status === 'idle') void start();
  }, [status, start, stop]);

  return { status, toggle };
}
