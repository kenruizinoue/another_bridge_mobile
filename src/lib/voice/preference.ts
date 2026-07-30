// Conversation-mode preferences. Barge-in keeps the mic open while the
// reply generates and plays, so talking over it cuts the audio and your
// words become the next message. Default ON; the settings toggle turns
// it off if speaker echo self-triggers on a particular device.
import AsyncStorage from '@react-native-async-storage/async-storage';

const BARGE_KEY = 'voice-barge-in';

export async function getBargeInEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BARGE_KEY)) !== 'false';
}

export async function setBargeInEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BARGE_KEY, String(enabled));
}
