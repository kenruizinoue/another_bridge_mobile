import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
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
import useDeleteSession from '../hooks/useDeleteSession';
import useOpenOnMac from '../hooks/useOpenOnMac';
import { colors, font, mono, space } from '../theme';

// The card list. Tapping a card calls onOpen(card). The + button starts a
// new session (onNew) or switches to "Resume on Mac", where tapping a card
// opens that session in a new terminal tab on the Mac instead.
export default function SessionListScreen({
  onOpen,
  onOpenFiles,
  onNew,
  onOpenProcesses,
}: {
  onOpen: (card: Card) => void;
  onOpenFiles?: () => void;
  onNew?: () => void;
  onOpenProcesses?: () => void;
}) {
  const [pickForMac, setPickForMac] = useState(false);
  const mac = useOpenOnMac();
  const openMenu = () => {
    const choose = (i: number) => {
      if (i === 0) onNew?.();
      else if (i === 1) setPickForMac(true);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['New session', 'Resume on Mac', 'Cancel'], cancelButtonIndex: 2 },
        choose,
      );
    } else {
      Alert.alert('Start', undefined, [
        { text: 'New session', onPress: () => choose(0) },
        { text: 'Resume on Mac', onPress: () => choose(1) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };
  const removal = useDeleteSession((sessionId) =>
    setSessions((list) => list.filter((c) => c.session_id !== sessionId)),
  );
  // Long-press a card: its actions. Delete asks twice (useDeleteSession).
  const onCardLongPress = (card: Card) => {
    const choose = (i: number) => {
      if (i === 0) void mac.open(card.session_id, card.title);
      else if (i === 1) removal.confirmDelete(card);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: card.title,
          options: ['Open on Mac', 'Delete session…', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        choose,
      );
    } else {
      Alert.alert(card.title, undefined, [
        { text: 'Open on Mac', onPress: () => choose(0) },
        { text: 'Delete session…', style: 'destructive', onPress: () => choose(1) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };
  const onCardPress = (card: Card) => {
    if (!pickForMac) return onOpen(card);
    setPickForMac(false);
    void mac.open(card.session_id, card.title);
  };
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
      {/* iOS large-title layout: the buttons get their own row, the title
          the full width below, so nothing is squeezed on a narrow phone. */}
      <View style={styles.toolbar}>
        <GlassIconButton
          name="settings-outline"
          onPress={() => setShowSettings(true)}
          size={36}
          testID="open-settings"
          label="Settings"
        />
        <View style={styles.headerSpacer} />
        <Text style={styles.version}>v{Constants.expoConfig?.version ?? '?'}</Text>
        {onOpenProcesses ? (
          <GlassIconButton
            name="pulse-outline"
            onPress={onOpenProcesses}
            size={36}
            testID="open-processes"
            label="What runs on the Mac"
          />
        ) : null}
        {onOpenFiles ? (
          <GlassIconButton name="folder-outline" onPress={onOpenFiles} size={36} testID="open-files" label="Files" />
        ) : null}
        {onNew ? (
          <GlassIconButton
            name="add"
            onPress={openMenu}
            filled
            size={36}
            testID="open-new-menu"
            label="New session or resume on Mac"
          />
        ) : null}
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Conversations
        </Text>
        {!loading && !error ? <Text style={styles.headerCount}>{sessions.length}</Text> : null}
      </View>

      {pickForMac ? (
        <View style={styles.pickBanner} testID="mac-pick-banner">
          <Ionicons name="desktop-outline" size={16} color={colors.accent} />
          <Text style={styles.pickText}>Tap a session to open it in a new tab on your Mac.</Text>
          <Pressable
            testID="mac-pick-cancel"
            accessibilityRole="button"
            onPress={() => setPickForMac(false)}
            hitSlop={8}
          >
            <Text style={styles.pickCancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {removal.deleting ? (
        <View style={styles.pickBanner} testID="session-deleting">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.pickText}>Deleting…</Text>
        </View>
      ) : null}
      {mac.opening ? (
        <View style={styles.pickBanner} testID="mac-opening">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.pickText}>Opening it on the Mac…</Text>
        </View>
      ) : null}

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
          renderItem={({ item }) => (
            <SessionCard card={item} onPress={onCardPress} onLongPress={pickForMac ? undefined : onCardLongPress} />
          )}
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerTitle: { flexShrink: 1, color: colors.textPrimary, fontSize: 30, fontWeight: '700' },
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
  pickBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.xl,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
    backgroundColor: 'rgba(13,19,26,0.92)',
  },
  pickText: { flex: 1, color: colors.textPrimary, fontSize: font.meta },
  pickCancel: { color: colors.accent, fontSize: font.meta, fontFamily: mono },
});
