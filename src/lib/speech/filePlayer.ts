// Plays one local audio file via expo-audio. Kept apart from the
// remoteSpeaker shell so tests can inject a fake player and this stays
// the only speech file touching the native audio player.
import { createAudioPlayer } from 'expo-audio';
import type { PlayFile } from './remoteSpeaker';
import type { SpeakResult } from './types';

export const expoFilePlayer: PlayFile = (uri, onFinish) => {
  const player = createAudioPlayer(uri);
  let settled = false;

  const settle = (result: SpeakResult) => {
    if (settled) return;
    settled = true;
    try {
      player.remove();
    } catch {
      // releasing twice is harmless; never let cleanup mask the result
    }
    onFinish(result);
  };

  const sub = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      sub.remove();
      settle('done');
    }
  });
  player.play();

  return {
    stop: () => {
      sub.remove();
      try {
        player.pause();
      } catch {
        // already released
      }
      settle('stopped');
    },
  };
};
