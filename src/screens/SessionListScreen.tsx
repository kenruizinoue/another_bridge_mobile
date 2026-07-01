import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchSessions } from '../api/sessions';
import type { SessionCard as Card } from '../api/types';
import SessionCard from '../components/SessionCard';
import { colors, font, space } from '../theme';

// The card list. Tapping a card calls onOpen(card).
export default function SessionListScreen({ onOpen }: { onOpen: (card: Card) => void }) {
  const [sessions, setSessions] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setSessions(await fetchSessions());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        {!loading && !error ? <Text style={styles.headerCount}>{sessions.length}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Loading sessions…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t load</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <Text style={styles.dim}>Pull down to retry.</Text>
        </View>
      ) : (
        <FlatList
          testID="session-list"
          data={sessions}
          keyExtractor={(item) => item.session_id}
          renderItem={({ item }) => <SessionCard card={item} onPress={onOpen} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />
          }
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
    alignItems: 'baseline',
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 26, fontWeight: '700' },
  headerCount: { color: colors.accent, fontSize: font.title, fontWeight: '600', marginLeft: 10 },
  listContent: { paddingVertical: 6, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: space.sm },
  dim: { color: colors.textDim, fontSize: font.meta, textAlign: 'center' },
  errorTitle: { color: colors.error, fontSize: font.title, fontWeight: '600' },
  errorMsg: { color: '#c0c9d4', fontSize: font.meta, textAlign: 'center' },
});
