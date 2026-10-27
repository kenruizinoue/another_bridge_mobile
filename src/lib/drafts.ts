import AsyncStorage from '@react-native-async-storage/async-storage';

// Unsent composer text, one per session, kept on the phone so leaving a
// chat, closing the app or installing a new build never loses it (1.7.0
// and earlier kept it in memory only). Sending clears it.
const PREFIX = 'draft:';

export async function loadDraft(sessionId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(PREFIX + sessionId)) ?? '';
  } catch {
    return '';
  }
}

export async function saveDraft(sessionId: string, text: string): Promise<void> {
  try {
    if (text.trim()) await AsyncStorage.setItem(PREFIX + sessionId, text);
    else await AsyncStorage.removeItem(PREFIX + sessionId);
  } catch {
    // Storage failing must never block typing or sending.
  }
}
