import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { enqueueResume, fetchMessages, resumeSessionStream, resumeStatus } from '../api/sessions';
import type { SessionCard, ToolRef, Turn } from '../api/types';
import GlassIconButton from '../components/GlassIconButton';
import ToolLines from '../components/ToolLines';
import TurnRow from '../components/TurnRow';
import { colors, font, mono, space } from '../theme';

// Terminal-style conversation view: full width, no bubbles, monospace,
// max reading space. Newest at the bottom (inverted); scrolling up loads
// older turns. The input is present but not wired to send yet — resuming
// a session (claude --resume) is the next milestone.
export default function ChatScreen({
  session,
  onBack,
}: {
  session: SessionCard;
  onBack: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
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
  const CATCH_UP_INTERVALS_MS = [3000, 5000, 10000, 30000];

  // Re-fetch the latest page. `initial` shows the full-screen spinner and
  // surfaces load errors; `refresh` (the top-bar button) keeps the current
  // content on screen and only spins the button, so a live session that
  // grew shows its new turns at the bottom without a jarring blank.
  const applyLatest = useCallback(
    async (mode: 'initial' | 'refresh') => {
      mode === 'initial' ? setLoading(true) : setRefreshing(true);
      if (mode === 'initial') setError(null);
      try {
        const page = await fetchMessages(session.session_id);
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
    [session.session_id],
  );

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingMore || nextBefore == null) return;
    setLoadingMore(true);
    try {
      const page = await fetchMessages(session.session_id, nextBefore);
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
  }, [hasMore, loadingMore, nextBefore, session.session_id]);

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
        status = await resumeStatus(session.session_id);
        const page = await fetchMessages(session.session_id);
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
    [session.session_id, stopPolling],
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
  // already running or messages are queued, QUEUE this one server-side —
  // the bridge keeps advancing the conversation even if the phone locks,
  // and catch-up pulls it all when we return.
  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message) return;
    setDraft('');
    setSendError(null);

    const busy = sending || syncing || queued.length > 0;
    if (busy) {
      setQueued((q) => [...q, message]); // optimistic; status polls reconcile
      inFlight.current = true;
      try {
        await enqueueResume(session.session_id, message);
      } catch (e) {
        setQueued((q) => {
          const i = q.lastIndexOf(message);
          return i === -1 ? q : [...q.slice(0, i), ...q.slice(i + 1)];
        });
        setDraft(message);
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
      text: message,
      tool_calls: 0,
      tools: [],
      timestamp: null,
    };
    setTurns((prev) => [optimistic, ...prev]); // newest-first: index 0 = bottom

    const rollback = () => {
      inFlight.current = false;
      setTurns((prev) => prev.filter((t) => t.index !== -1));
      setDraft(message);
      setSending(false);
      setStreamText('');
      setStreamTools([]);
    };

    resumeSessionStream(session.session_id, message, {
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
    });
  }, [draft, sending, syncing, queued.length, session.session_id, catchUp]);

  // On open (mount — includes a fresh app launch or coming back to the
  // card after leaving), load the conversation AND ask the server whether
  // a resume is still running for this session. Because that state lives
  // on the bridge (not in this component), it's correct even if the app
  // was killed mid-turn: if running, show the indicator and catch up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await applyLatest('initial');
      if (cancelled) return;
      try {
        const status = await resumeStatus(session.session_id);
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
  }, [applyLatest, catchUp, session.session_id]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>‹ back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {session.title}
        </Text>
        <GlassIconButton
          glyph="↻"
          onPress={() => applyLatest('refresh')}
          disabled={loading}
          busy={refreshing}
          size={40}
        />
      </View>
      <Text style={styles.subheader} numberOfLines={1} ellipsizeMode="head">
        {session.project} · {session.message_count} msgs
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Loading conversation…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t load</Text>
          <Text style={styles.errorMsg}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={turns}
          inverted
          keyExtractor={(t) => String(t.index)}
          renderItem={({ item }) => <TurnRow turn={item} />}
          contentContainerStyle={styles.listContent}
          // Inverted list → the header renders at the visual BOTTOM, below
          // the just-sent user turn, which is exactly where the live reply
          // should stream in.
          ListHeaderComponent={
            sending ? <StreamingTurn text={streamText} tools={streamTools} /> : null
          }
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
            ) : !hasMore && turns.length ? (
              <Text style={styles.topMarker}>— start of conversation —</Text>
            ) : null
          }
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {queued.length > 0 ? (
          <View style={styles.queueList}>
            {queued.map((m, i) => (
              <Text key={i} style={styles.queueItem} numberOfLines={1}>
                ⋯ {m}
              </Text>
            ))}
          </View>
        ) : null}

        {sending || syncing ? (
          // Persists until the run truly finishes (the `done` event, or
          // catch-up seeing running=false AND the queue empty).
          <View style={styles.workingBar}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.workingText}>
              {syncing
                ? queued.length > 0
                  ? `syncing — ${queued.length} queued…`
                  : 'reconnecting — syncing from the Mac…'
                : streamText
                  ? 'streaming…'
                  : 'claude is working on the Mac…'}
            </Text>
          </View>
        ) : sendError ? (
          <View style={styles.workingBar}>
            <Text style={styles.sendErrorText} numberOfLines={2}>
              ✕ {sendError}
            </Text>
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <Text style={styles.prompt}>❯</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            // Always editable — typing while a turn runs QUEUES the message.
            placeholder={
              sending || syncing || queued.length > 0
                ? 'Queue a message…'
                : 'Message… (continues this session)'
            }
            placeholderTextColor="#4a5666"
            multiline
          />
          <GlassIconButton
            glyph="↑"
            onPress={send}
            disabled={!draft.trim()}
            filled={!!draft.trim()}
            size={40}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// The live reply as it streams in. Rendered as plain monospace (not
// markdown) with a blinking-ish cursor while tokens arrive; once `done`
// fires, applyLatest() replaces it with the canonical, markdown-rendered
// turn. Tool steps appear as they're surfaced.
function StreamingTurn({ text, tools }: { text: string; tools: ToolRef[] }) {
  return (
    <View style={styles.streamTurn}>
      <Text style={[styles.streamRole]}>● claude</Text>
      <Text style={styles.streamBody} selectable>
        {text}
        <Text style={styles.cursor}>▋</Text>
      </Text>
      {tools.length ? (
        <View style={{ marginTop: space.sm }}>
          <ToolLines tools={tools} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  streamTurn: { marginBottom: space.lg + 2 },
  streamRole: { color: colors.accent, fontSize: font.small, fontFamily: mono, marginBottom: space.xs },
  streamBody: { color: colors.textBody, fontSize: font.body, lineHeight: 20, fontFamily: mono },
  cursor: { color: colors.accent },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.xs },
  backBtn: { paddingVertical: 6, paddingRight: 10 },
  backText: { color: colors.accent, fontSize: font.title, fontFamily: mono },
  headerTitle: { color: colors.textPrimary, fontSize: font.title, fontWeight: '600', flex: 1 },
  refreshBtn: {
    width: 40,
    height: 40,
    marginLeft: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: { color: colors.accent, fontSize: 28, fontFamily: mono, lineHeight: 32 },
  subheader: {
    color: colors.textFaint,
    fontSize: font.tiny,
    fontFamily: mono,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  listContent: { paddingHorizontal: space.md, paddingVertical: space.md },
  topMarker: { color: '#4a5666', fontSize: font.tiny, fontFamily: mono, textAlign: 'center', marginVertical: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: space.sm },
  dim: { color: colors.textDim, fontSize: font.meta },
  errorTitle: { color: colors.error, fontSize: font.title, fontWeight: '600' },
  errorMsg: { color: '#c0c9d4', fontSize: font.meta, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.inputBg,
  },
  prompt: { color: colors.user, fontSize: font.title, fontFamily: mono, marginRight: space.sm, marginTop: 2 },
  input: { flex: 1, color: colors.textBody, fontSize: font.title, fontFamily: mono, maxHeight: 100, padding: 0 },
  sendBtn: {
    marginLeft: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendText: { color: '#06121d', fontSize: font.small, fontWeight: '700', fontFamily: mono },
  workingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.inputBg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  workingText: { color: colors.textDim, fontSize: font.small, fontFamily: mono },
  sendErrorText: { color: colors.error, fontSize: font.small, fontFamily: mono, flex: 1 },
  queueList: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: 2,
    backgroundColor: colors.inputBg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  queueItem: { color: colors.textFaint, fontSize: font.small, fontFamily: mono },
});
