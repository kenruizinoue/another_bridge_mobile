// The conversation state machine for one session, extracted from the
// screen so ChatScreen stays layout-only. Owns: the turn list + paging,
// live streaming, the server-side send queue, and catch-up (re-syncing
// from the Mac's transcript after a dropped stream / lock / relaunch).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  enqueueResume,
  fetchMessages,
  resumeSessionStream,
  resumeStatus,
  type OutgoingImage,
} from '../api/sessions';
import type { ToolRef, Turn } from '../api/types';

const CATCH_UP_INTERVALS_MS = [3000, 5000, 10000, 30000];

export default function useChatSession(sessionId: string) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [streamTools, setStreamTools] = useState<ToolRef[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [queued, setQueued] = useState<string[]>([]);

  // Catch-up state. `inFlight` = a turn we sent is still expected to be
  // running on the Mac (kept in a ref so listeners see the latest without
  // re-subscribing). Backoff mirrors the web client: fast, then ease off.
  const inFlight = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIter = useRef(0);

  // Re-fetch the latest page. `initial` shows the full-screen spinner and
  // surfaces load errors; `refresh` (the top-bar button) keeps the current
  // content on screen and only spins the button, so a live session that
  // grew shows its new turns at the bottom without a jarring blank.
  const applyLatest = useCallback(
    async (mode: 'initial' | 'refresh') => {
      mode === 'initial' ? setLoading(true) : setRefreshing(true);
      if (mode === 'initial') setError(null);
      try {
        const page = await fetchMessages(sessionId);
        setTurns(page.messages);
        setNextBefore(page.next_before);
        setHasMore(page.has_more);
      } catch (e) {
        // On refresh, keep what's on screen rather than wiping it.
        if (mode === 'initial') setError(e instanceof Error ? e.message : String(e));
      } finally {
        mode === 'initial' ? setLoading(false) : setRefreshing(false);
      }
    },
    [sessionId],
  );

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingMore || nextBefore == null) return;
    setLoadingMore(true);
    try {
      const page = await fetchMessages(sessionId, nextBefore);
      // Older page is also newest-first; append after current turns so
      // the whole array stays globally newest-first (inverted list shows
      // index 0 at the bottom).
      setTurns((prev) => [...prev, ...page.messages]);
      setNextBefore(page.next_before);
      setHasMore(page.has_more);
    } catch {
      // A failed older-page fetch shouldn't wipe what's on screen.
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextBefore, sessionId]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Catch-up: the Mac's transcript is the source of truth, so instead of
  // fighting to keep a socket open we re-sync from it. Each pass reads the
  // "is a resume still running?" signal + the latest turns. While running,
  // it re-polls with backoff; once the run finishes, the last pass shows
  // the final reply and we stop. Never re-sends — pure read, so it's safe
  // to fire on reconnect / foreground without duplicating the turn.
  const catchUp = useCallback(
    async (fromPoll = false) => {
      if (!fromPoll) pollIter.current = 0;
      let status;
      try {
        status = await resumeStatus(sessionId);
        const page = await fetchMessages(sessionId);
        setTurns(page.messages);
        setNextBefore(page.next_before);
        setHasMore(page.has_more);
        setQueued(status.queued);
        setSendError(null);
      } catch {
        // Transient (still offline). Don't reschedule into a tight failure
        // loop — the next foreground / online / manual ⟳ will retry.
        return;
      }

      // Busy while a turn is generating OR messages are still queued.
      if (status.running || status.queue_count > 0) {
        setSyncing(true);
        const idx = Math.min(pollIter.current, CATCH_UP_INTERVALS_MS.length - 1);
        pollIter.current += 1;
        stopPolling();
        pollTimer.current = setTimeout(() => {
          void catchUp(true);
        }, CATCH_UP_INTERVALS_MS[idx]);
      } else {
        // Nothing running and nothing queued — the conversation has fully
        // advanced; the latest fetch already has every reply.
        inFlight.current = false;
        setSyncing(false);
        setSending(false);
        setStreamText('');
        setStreamTools([]);
        setQueued([]);
        stopPolling();
      }
    },
    [sessionId, stopPolling],
  );

  // Reconnect on return-to-foreground (RN's analogue of visibilitychange):
  // if a turn was in flight when we were backgrounded (iOS suspends the
  // stream), catch up from the transcript.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && inFlight.current) void catchUp();
    });
    return () => sub.remove();
  }, [catchUp]);

  useEffect(() => stopPolling, [stopPolling]);

  // Send a message. If nothing is in flight, stream it live. If a turn is
  // already running or messages are queued, QUEUE it server-side — the
  // bridge keeps advancing the conversation even if the phone locks, and
  // catch-up pulls it all when we return. `restore` is called when the
  // message must be handed back to the composer (send never started).
  const send = useCallback(
    async (message: string, images: OutgoingImage[], restore: () => void) => {
      if (!message && images.length === 0) return;
      setSendError(null);

      const preview = message || `📎 ${images.length} image(s)`;
      const busy = sending || syncing || queued.length > 0;
      if (busy) {
        setQueued((q) => [...q, preview]); // optimistic; status polls reconcile
        inFlight.current = true;
        try {
          await enqueueResume(sessionId, message, images);
        } catch (e) {
          setQueued((q) => {
            const i = q.lastIndexOf(preview);
            return i === -1 ? q : [...q.slice(0, i), ...q.slice(i + 1)];
          });
          restore();
          setSendError(e instanceof Error ? e.message : String(e));
          return;
        }
        setSyncing(true);
        void catchUp(); // reflect the queue + drive it to completion
        return;
      }

      // Nothing in flight → stream it live.
      setSending(true);
      setStreamText('');
      setStreamTools([]);
      inFlight.current = true;

      const optimistic: Turn = {
        index: -1,
        uuid: 'optimistic',
        role: 'user',
        text: preview,
        tool_calls: 0,
        tools: [],
        timestamp: null,
      };
      setTurns((prev) => [optimistic, ...prev]); // newest-first: index 0 = bottom

      const rollback = () => {
        inFlight.current = false;
        setTurns((prev) => prev.filter((t) => t.index !== -1));
        restore();
        setSending(false);
        setStreamText('');
        setStreamTools([]);
      };

      resumeSessionStream(
        sessionId,
        message,
        {
          onText: (chunk) => setStreamText((t) => t + chunk),
          onTool: (tool) => setStreamTools((ts) => [...ts, tool]),
          onError: (msg) => {
            // Failed before producing a turn (couldn't reach bridge / 409 /
            // bad key) — roll back so the message isn't lost.
            rollback();
            setSendError(msg);
          },
          onDone: async () => {
            // The `done` event fired — this streamed turn finished. Hand to
            // catch-up: it refreshes to canonical turns and, if a queued
            // message is still draining, keeps syncing until the queue empties.
            setSending(false);
            setStreamText('');
            setStreamTools([]);
            await catchUp();
          },
          onInterrupted: () => {
            // Connection dropped before `done`, but the turn IS running on the
            // Mac. Don't roll back and don't error — hand off to catch-up,
            // which polls the transcript until the reply lands.
            setStreamText('');
            setStreamTools([]);
            setSending(false);
            void catchUp();
          },
        },
        images,
      );
    },
    [sending, syncing, queued.length, sessionId, catchUp],
  );

  // On open (mount — includes a fresh app launch or coming back to the
  // card after leaving), load the conversation AND ask the server whether
  // a resume is still running for this session. Because that state lives
  // on the bridge (not in this hook), it's correct even if the app was
  // killed mid-turn: if running, show the indicator and catch up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await applyLatest('initial');
      if (cancelled) return;
      try {
        const status = await resumeStatus(sessionId);
        if (!cancelled && (status.running || status.queue_count > 0)) {
          inFlight.current = true;
          setQueued(status.queued);
          void catchUp();
        }
      } catch {
        // offline / status unavailable — ⟳ or foreground will retry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyLatest, catchUp, sessionId]);

  return {
    // conversation
    turns,
    hasMore,
    loading,
    loadingMore,
    refreshing,
    error,
    refresh: () => applyLatest('refresh'),
    loadOlder,
    // send / live state
    send,
    sending,
    sendError,
    syncing,
    queued,
    streamText,
    streamTools,
  };
}
