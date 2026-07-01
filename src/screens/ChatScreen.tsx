import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { fetchMessages } from '../api/sessions';
import type { SessionCard, Turn } from '../api/types';
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

  useEffect(() => {
    applyLatest('initial');
  }, [applyLatest]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>‹ back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {session.title}
        </Text>
        <Pressable
          onPress={() => applyLatest('refresh')}
          disabled={refreshing || loading}
          hitSlop={12}
          style={styles.refreshBtn}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.refreshIcon}>⟳</Text>
          )}
        </Pressable>
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
        <View style={styles.inputRow}>
          <Text style={styles.prompt}>❯</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="resume not wired yet"
            placeholderTextColor="#4a5666"
            multiline
            editable={false}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
});
