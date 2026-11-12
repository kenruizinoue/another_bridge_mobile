import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { deleteSession } from '../api/sessions';
import type { SessionCard } from '../api/types';
import { DELETE_WORD, isDeleteConfirmed } from '../lib/macSessions';

// Deleting a session is a critical action, so it takes two checks: a
// warning with a destructive Delete button, then typing DELETE. Only then
// does the bridge move the session to its trash folder.
export default function useDeleteSession(onDeleted: (sessionId: string) => void) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const mounted = useRef(true);
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (card: SessionCard) => {
    setDeleting(card.session_id);
    try {
      await deleteSession(card.session_id);
      if (mounted.current) onDeletedRef.current(card.session_id);
    } catch (e) {
      Alert.alert("Couldn't delete it", e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setDeleting(null);
    }
  }, []);

  const askToType = useCallback(
    (card: SessionCard) =>
      Alert.prompt(
        `Type ${DELETE_WORD} to confirm`,
        `"${card.title}" will be gone from the phone and from Claude Code on the Mac.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: (typed?: string) => {
              if (isDeleteConfirmed(typed)) void run(card);
              else Alert.alert('Not deleted', `You didn't type ${DELETE_WORD}.`);
            },
          },
        ],
        'plain-text',
      ),
    [run],
  );

  const confirmDelete = useCallback(
    (card: SessionCard) =>
      Alert.alert(
        `Delete "${card.title}"?`,
        'This removes the conversation from your phone and from Claude Code on the Mac. The bridge keeps a copy in its trash folder.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete…', style: 'destructive', onPress: () => askToType(card) },
        ],
      ),
    [askToType],
  );

  return { confirmDelete, deleting };
}
