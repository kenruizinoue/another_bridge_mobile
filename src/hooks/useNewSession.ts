import { useCallback, useEffect, useRef, useState } from 'react';
import { newSessionStream, type OutgoingFile, type OutgoingImage } from '../api/sessions';
import type { SessionCard } from '../api/types';
import { newSessionCard } from '../lib/macSessions';

// Start a session from the phone. The bridge answers with the new id once
// the session exists on the Mac; then this stops listening and hands a
// card to `onCreated`, and the chat screen attaches to the first turn,
// which keeps running on the Mac either way.
export default function useNewSession(onCreated: (card: SessionCard) => void) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel.current?.();
      cancel.current = null;
    };
  }, []);

  // `restore` hands the message back to the form when the start failed.
  const start = useCallback(
    (
      message: string,
      name: string,
      images: OutgoingImage[] = [],
      files: OutgoingFile[] = [],
      restore?: () => void,
    ) => {
      if (cancel.current) return; // one start at a time
      setStarting(true);
      setError(null);
      let settled = false;
      const stop = newSessionStream(
        message,
        name.trim(),
        {
          onSession: (session) => {
            settled = true;
            const close = cancel.current;
            cancel.current = null;
            close?.(); // the first turn keeps running on the Mac
            if (!mounted.current) return;
            setStarting(false);
            onCreatedRef.current(newSessionCard(session, message));
          },
          onError: (msg) => {
            settled = true;
            cancel.current = null;
            if (!mounted.current) return;
            setStarting(false);
            setError(msg);
            restore?.();
          },
        },
        images,
        files,
      );
      // The stream can settle before newSessionStream returns (no key set).
      if (settled) stop();
      else cancel.current = stop;
    },
    [],
  );

  return { start, starting, error };
}
