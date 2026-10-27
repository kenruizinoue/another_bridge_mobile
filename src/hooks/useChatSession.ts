// The conversation state machine for one session, extracted from the
// screen so ChatScreen stays layout-only. Owns: the turn list + paging,
// live streaming, the server-side send queue, and catch-up (re-syncing
// from the Mac's transcript after a dropped stream / lock / relaunch).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  attachResumeStream,
  enqueueResume,
  fetchMessages,
  releaseQueue,
  resumeSessionStream,
  resumeStatus,
  type HoldReason,
  type OutgoingFile,
  type OutgoingImage,
  type ResumeStatus,
} from '../api/sessions';
import type { MessagesPage, TerminalInfo, ToolRef, Turn } from '../api/types';

// Polling backoff, used only when live attach can't run (a bridge without
// /resume/attach, a queued turn that hasn't started) and to retry a failed
// catch-up: fast, then ease off, never slower than 15 s.
const CATCH_UP_INTERVALS_MS = [3000, 5000, 10000, 15000];

// "2026/Oct/22 AnotherSystems Marketing" -> "AnotherSystems Marketing"
const titlesOf = (s: ResumeStatus): string[] =>
  (s.held_by ?? []).map((h) => h.title.replace(/^\d{4}\/\w{3}\/\d{1,2}\s+/, ''));

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
  // Watching a running turn through /resume/attach (after leaving the
  // chat, a dropped stream or a relaunch): the reply streams in as if the
  // phone never left.
  const [live, setLive] = useState(false);
  // The last catch-up couldn't reach the bridge; it retries on its own.
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState<string[]>([]);
  // Why the queue waits (a working terminal tab, or the bridge's turn cap),
  // and the terminal tab holding this session, if any. While that tab
  // works, the bridge holds phone messages instead of starting a second
  // copy of the session, and catch-up keeps showing the tab's replies.
  const [held, setHeld] = useState<HoldReason | null>(null);
  const [heldBy, setHeldBy] = useState<string[]>([]); // titles of those sessions
  const [terminal, setTerminal] = useState<TerminalInfo | null>(null);
  // Voice turns only: the schema-guaranteed spoken summary of the last
  // finished reply (null otherwise / until it lands).
  const [speech, setSpeech] = useState<string | null>(null);

  // Kept in refs so listeners and timers see the latest without
  // re-subscribing. `inFlight` = a turn is expected to be running on the
  // Mac. A stream's token goes stale when it is replaced, so late events
  // from an aborted stream are ignored.
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIter = useRef(0);
  const sendCancel = useRef<(() => void) | null>(null);
  const sendVoice = useRef(false);
  const sendToken = useRef(0);
  const attachCancel = useRef<(() => void) | null>(null);
  const attachToken = useRef(0);
  const attachSupported = useRef(true);
  const loadedOlder = useRef(false);
  const loadingOlder = useRef(false);
  const catchUpRef = useRef<(fromPoll?: boolean) => Promise<void>>(async () => {});

  // Show the latest page, keeping any older pages already loaded with
  // loadOlder so a catch-up never yanks the reader back to the bottom page.
  const applyPage = useCallback((page: MessagesPage) => {
    setTurns((prev) => {
      const oldestNew = page.messages.reduce((m, t) => Math.min(m, t.index), Infinity);
      const older = prev.filter((t) => t.index >= 0 && t.index < oldestNew);
      return older.length ? [...page.messages, ...older] : page.messages;
    });
    if (!loadedOlder.current) {
      setNextBefore(page.next_before);
      setHasMore(page.has_more);
    }
  }, []);

  // Initial load: the full-screen spinner, and load errors are surfaced.
  const applyLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchMessages(sessionId);
      if (!mounted.current) return;
      loadedOlder.current = false;
      setTurns(page.messages);
      setNextBefore(page.next_before);
      setHasMore(page.has_more);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [sessionId]);

  const loadOlder = useCallback(async () => {
    // The ref guard stops a second scroll event from appending the same
    // page before the loading state lands.
    if (!hasMore || loadingOlder.current || nextBefore == null) return;
    loadingOlder.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchMessages(sessionId, nextBefore);
      if (!mounted.current) return;
      // Older page is also newest-first; append after current turns so
      // the whole array stays globally newest-first (inverted list shows
      // index 0 at the bottom).
      loadedOlder.current = true;
      setTurns((prev) => [...prev, ...page.messages]);
      setNextBefore(page.next_before);
      setHasMore(page.has_more);
    } catch {
      // A failed older-page fetch shouldn't wipe what's on screen.
    } finally {
      loadingOlder.current = false;
      if (mounted.current) setLoadingMore(false);
    }
  }, [hasMore, nextBefore, sessionId]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    const idx = Math.min(pollIter.current, CATCH_UP_INTERVALS_MS.length - 1);
    pollIter.current += 1;
    stopPolling();
    pollTimer.current = setTimeout(() => {
      void catchUpRef.current(true);
    }, CATCH_UP_INTERVALS_MS[idx]);
  }, [stopPolling]);

  const stopAttach = useCallback(() => {
    attachToken.current += 1;
    attachCancel.current?.();
    attachCancel.current = null;
  }, []);

  // Drop the live send stream (the turn keeps running on the Mac).
  const detachSend = useCallback(() => {
    if (!sendCancel.current) return;
    sendToken.current += 1;
    sendCancel.current();
    sendCancel.current = null;
    setSending(false);
  }, []);

  const clearLiveView = useCallback(() => {
    setSending(false);
    setLive(false);
    setStreamText('');
    setStreamTools([]);
  }, []);

  // Watch the running turn live. Call right after a transcript fetch: the
  // bridge replays only the message being written now, since finished
  // ones are already in the turns on screen.
  const follow = useCallback(() => {
    stopAttach();
    const token = attachToken.current;
    const mine = () => mounted.current && token === attachToken.current;
    setSending(false);
    setLive(true);
    setStreamText('');
    setStreamTools([]);
    attachCancel.current = attachResumeStream(sessionId, {
      onText: (chunk) => mine() && setStreamText((t) => t + chunk),
      onTool: (tool) => mine() && setStreamTools((ts) => [...ts, tool]),
      onDone: () => {
        if (!mine()) return;
        attachCancel.current = null;
        // Keep the streamed reply on screen until catch-up swaps in the
        // transcript (or attaches to the next queued turn).
        void catchUpRef.current();
      },
      onDropped: (status) => {
        if (!mine()) return;
        attachCancel.current = null;
        if (status === 404) attachSupported.current = false; // older bridge
        schedule(); // the next pass re-attaches if the turn still runs
      },
    });
  }, [sessionId, schedule, stopAttach]);

  // Catch-up: the Mac's transcript is the source of truth. Each pass reads
  // the "is a resume still running?" signal + the latest turns. While a
  // turn runs it attaches to it live (or polls on an older bridge); once
  // everything finished, the last pass shows the final reply and stops.
  // Never re-sends, so it is safe on reconnect / foreground / refresh.
  const catchUp = useCallback(
    async (fromPoll = false) => {
      if (!fromPoll) pollIter.current = 0;
      stopPolling();
      if (sendCancel.current) {
        // A live send stream drives the view; its done or drop calls
        // catch-up again. Only mirror the server queue meanwhile.
        try {
          const s = await resumeStatus(sessionId);
          if (mounted.current) {
            setQueued(s.queued);
            setHeld(s.held ?? null);
            setHeldBy(titlesOf(s));
            setTerminal(s.terminal ?? null);
          }
        } catch {
          // the stream itself reports trouble
        }
        return;
      }
      let status: ResumeStatus;
      try {
        status = await resumeStatus(sessionId);
        const page = await fetchMessages(sessionId);
        if (!mounted.current) return;
        applyPage(page);
        setQueued(status.queued);
        setHeld(status.held ?? null);
        setHeldBy(titlesOf(status));
        setTerminal(status.terminal ?? null);
        setSendError(null);
        setOffline(false);
      } catch {
        if (!mounted.current) return;
        // Offline or ngrok reconnecting: keep the busy state and retry
        // with backoff, so the bar can't stick once the Mac is back.
        setOffline(true);
        if (inFlight.current) schedule();
        return;
      }

      // Busy while a turn is generating OR messages are still queued.
      if (status.running || status.queue_count > 0) {
        inFlight.current = true;
        setSyncing(true);
        if (status.running && attachSupported.current) {
          pollIter.current = 0;
          follow();
        } else {
          stopAttach();
          clearLiveView();
          schedule();
        }
      } else {
        // Nothing running and nothing queued: the latest fetch already
        // has every reply.
        inFlight.current = false;
        stopAttach();
        clearLiveView();
        setSyncing(false);
        setQueued([]);
        // A terminal tab is working on this session: keep pulling the
        // transcript so its replies show up here too.
        if (status.terminal?.active) schedule();
      }
    },
    [sessionId, applyPage, clearLiveView, follow, schedule, stopAttach, stopPolling],
  );
  catchUpRef.current = catchUp;

  // Back from the background: iOS froze the app, so a text send's stream
  // or the attach may be dead without saying so. Re-sync and attach fresh.
  // A voice send keeps its stream (it carries the spoken summary); the
  // stream's idle watchdog catches it if it died.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !inFlight.current) return;
      if (sendCancel.current && sendVoice.current) return;
      detachSend();
      void catchUp();
    });
    return () => sub.remove();
  }, [catchUp, detachSend]);

  // Leaving the chat closes every stream and timer. The turn keeps
  // running on the Mac; reopening the chat attaches to it again.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopPolling();
      stopAttach();
      sendToken.current += 1;
      sendCancel.current?.();
      sendCancel.current = null;
    };
  }, [stopPolling, stopAttach]);

  // The top-bar button. During a turn it restarts catch-up (a fresh
  // transcript plus a fresh attach); otherwise it pulls the latest turns
  // and picks up a turn started elsewhere. Keeps what's on screen when
  // the bridge can't be reached.
  const refresh = useCallback(async () => {
    if (sendCancel.current && sendVoice.current) return;
    detachSend();
    setRefreshing(true);
    try {
      await catchUp();
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [catchUp, detachSend]);

  // Send a message. If nothing is in flight, stream it live. If a turn is
  // already running or messages are queued, QUEUE it server-side: the
  // bridge keeps advancing the conversation even if the phone locks, and
  // catch-up pulls it all when we return. `restore` is called when the
  // message must be handed back to the composer (send never started).
  const send = useCallback(
    async (
      message: string,
      images: OutgoingImage[],
      files: OutgoingFile[],
      restore: () => void,
      options?: { voice?: boolean },
    ) => {
      if (!message && images.length === 0 && files.length === 0) return;
      setSendError(null);
      setSpeech(null);
      const voice = options?.voice ?? false;

      const preview = message || `📎 ${images.length + files.length} attachment(s)`;
      // A terminal tab working on this session counts as busy: the bridge
      // queues the message until the tab is done, never a second copy.
      const busy = sending || syncing || live || queued.length > 0 || !!terminal?.active;
      if (busy) {
        setQueued((q) => [...q, preview]); // optimistic; status polls reconcile
        inFlight.current = true;
        try {
          await enqueueResume(sessionId, message, images, files, voice);
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
      stopAttach();
      setSending(true);
      setLive(false);
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

      sendToken.current += 1;
      const token = sendToken.current;
      const mine = () => mounted.current && token === sendToken.current;
      const release = () => {
        if (token === sendToken.current) sendCancel.current = null;
      };

      const rollback = () => {
        inFlight.current = false;
        setTurns((prev) => prev.filter((t) => t.index !== -1));
        restore();
        setSending(false);
        setStreamText('');
        setStreamTools([]);
      };

      sendVoice.current = voice;
      sendCancel.current = resumeSessionStream(
        sessionId,
        message,
        {
          onText: (chunk) => mine() && setStreamText((t) => t + chunk),
          onTool: (tool) => mine() && setStreamTools((ts) => [...ts, tool]),
          onSpeech: (s) => mine() && setSpeech(s),
          onQueued: (reason) => {
            if (!mine()) return;
            // The bridge queued it instead (a terminal tab started working,
            // or the turn cap): it isn't in the transcript yet, so show it
            // in the queue, not as a sent turn. `done` follows.
            setTurns((prev) => prev.filter((t) => t.index !== -1));
            setQueued((q) => [...q, preview]);
            setHeld(reason);
            setSending(false);
          },
          onError: (msg) => {
            if (!mine()) return;
            release();
            // Failed before producing a turn (couldn't reach bridge / 409 /
            // bad key): roll back so the message isn't lost.
            rollback();
            setSendError(msg);
          },
          onDone: async () => {
            if (!mine()) return;
            release();
            // The `done` event fired: this streamed turn finished. Catch-up
            // swaps in the canonical turns and, if a queued message is
            // still draining, attaches to it.
            await catchUp();
          },
          onInterrupted: () => {
            if (!mine()) return;
            release();
            // Connection dropped before `done`, but the turn IS running on
            // the Mac. Don't roll back and don't error: catch-up re-syncs
            // and attaches to the rest of the turn.
            void catchUp();
          },
        },
        images,
        files,
        voice,
      );
    },
    [sending, syncing, live, queued.length, terminal, sessionId, catchUp, stopAttach],
  );

  // "Send anyway": run the queued messages now instead of waiting for the
  // terminal tab (or the turn cap). For when Ken knows it's safe.
  const sendAnyway = useCallback(async () => {
    try {
      await releaseQueue(sessionId);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
      return;
    }
    setHeld(null);
    void catchUp();
  }, [sessionId, catchUp]);

  // On open (mount: a fresh app launch or coming back to the chat after
  // leaving), load the conversation AND ask the server whether a resume
  // is still running for this session. That state lives on the bridge,
  // so it is right even if the app was killed mid-turn: if running,
  // catch up and attach to it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await applyLatest();
      if (cancelled) return;
      try {
        const status = await resumeStatus(sessionId);
        if (cancelled) return;
        setTerminal(status.terminal ?? null);
        if (status.running || status.queue_count > 0) {
          inFlight.current = true;
          setQueued(status.queued);
          setHeld(status.held ?? null);
          setHeldBy(titlesOf(status));
          void catchUp();
        } else if (status.terminal?.active) {
          void catchUp(); // follow the terminal tab's replies
        }
      } catch {
        // offline / status unavailable: ⟳ or foreground will retry
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
    refresh,
    loadOlder,
    // send / live state
    send,
    sending,
    sendError,
    syncing,
    live,
    offline,
    queued,
    held,
    heldBy,
    terminal,
    sendAnyway,
    streamText,
    streamTools,
    speech,
  };
}
