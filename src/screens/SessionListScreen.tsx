import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { fetchSessions } from '../api/sessions';
import type { SessionCard as Card } from '../api/types';
import GlassIconButton from '../components/GlassIconButton';
import SessionCard from '../components/SessionCard';
import SettingsSheet from '../components/SettingsSheet';
import { colors, font, mono, space } from '../theme';

// The card list. Tapping a card calls onOpen(card).
export default function SessionListScreen({
  onOpen,
  onOpenFiles,
}: {
  onOpen: (card: Card) => void;
  onOpenFiles?: () => void;
}) {
  const [sessions, setSessions] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // The error stays up until a load succeeds, so a retry from the error
  // screen never flashes an empty "No conversations" list.
  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      setSessions(await fetchSessions());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Coming back to the app while the error shows (the bridge or tunnel was
  // down) retries by itself, so a fixed Mac needs no tap.
  const errorRef = useRef(error);
  errorRef.current = error;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && errorRef.current) void load(true);
    });
    return () => sub.remove();
  }, [load]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <GlassIconButton
          name="settings-outline"
          onPress={() => setShowSettings(true)}
          size={34}
          testID="open-settings"
          label="Settings"
        />
        <Text style={styles.headerTitle}>Conversations</Text>
        {!loading && !error ? <Text style={styles.headerCount}>{sessions.length}</Text> : null}
        <View style={styles.headerSpacer} />
        <Text style={styles.version}>v{Constants.expoConfig?.version ?? '?'}</Text>
        {onOpenFiles ? (
          <GlassIconButton name="folder-outline" onPress={onOpenFiles} size={34} testID="open-files" label="Files" />
        ) : null}
      </View>

      <SettingsSheet visible={showSettings} onClose={() => setShowSettings(false)} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Loading sessions…</Text>
        </View>
      ) : error ? (
        // A ScrollView, not a plain View, so the pull to retry has something
        // to pull (1.5.1 and earlier showed the hint on a view that couldn't).
        <ScrollView
          testID="session-error"
          contentContainerStyle={styles.grow}
          alwaysBounceVertical
          refreshControl={refreshControl}
        >
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Couldn’t load</Text>
            <Text style={styles.errorMsg}>{error}</Text>
            <Pressable
              testID="sessions-retry"
              accessibilityRole="button"
              onPress={() => load(true)}
              disabled={refreshing}
              style={styles.retry}
            >
              <Text style={styles.retryText}>{refreshing ? 'Retrying…' : 'Retry'}</Text>
            </Pressable>
            <Text style={styles.dim}>Or pull down to retry.</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          testID="session-list"
          data={sessions}
          keyExtractor={(item) => item.session_id}
          renderItem={({ item }) => <SessionCard card={item} onPress={onOpen} />}
          contentContainerStyle={[styles.listContent, sessions.length === 0 && styles.grow]}
          alwaysBounceVertical
          refreshControl={refreshControl}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.dim}>No conversations found.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 26, fontWeight: '700' },
  headerCount: { color: colors.accent, fontSize: font.title, fontWeight: '600' },
  headerSpacer: { flex: 1 },
  version: { color: colors.textFaint, fontSize: font.tiny, fontFamily: mono },
  listContent: { paddingVertical: 6, paddingBottom: 24 },
  grow: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: space.sm },
  dim: { color: colors.textDim, fontSize: font.meta, textAlign: 'center' },
  errorTitle: { color: colors.error, fontSize: font.title, fontWeight: '600' },
  errorMsg: { color: '#c0c9d4', fontSize: font.meta, textAlign: 'center' },
  retry: {
    marginTop: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
  },
  retryText: { color: colors.accent, fontSize: font.meta, fontFamily: mono },
});
