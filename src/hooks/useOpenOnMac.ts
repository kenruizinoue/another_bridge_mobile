import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { openOnMac } from '../api/sessions';
import { describeOpenOnMac } from '../lib/macSessions';

// "Open on Mac": asks the bridge to open the session in a new iTerm2 tab
// (Terminal when iTerm2 isn't installed) and tells Ken what happened. A
// session a phone turn is writing opens when that turn ends.
export default function useOpenOnMac() {
  const [opening, setOpening] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const open = useCallback(async (sessionId: string, title?: string) => {
    setOpening(true);
    try {
      const result = await openOnMac(sessionId);
      Alert.alert(title ?? 'Open on Mac', describeOpenOnMac(result));
    } catch (e) {
      Alert.alert("Couldn't open it on the Mac", e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setOpening(false);
    }
  }, []);

  return { open, opening };
}
