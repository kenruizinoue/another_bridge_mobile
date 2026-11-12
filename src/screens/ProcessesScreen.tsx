import { Ionicons } from '@expo/vector-icons';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClaudeProcess, RunningCommand } from '../api/processes';
import { describeStop, stopSession } from '../api/sessions';
import GlassIconButton from '../components/GlassIconButton';
import useProcesses from '../hooks/useProcesses';
import { formatDuration } from '../lib/time';
import { colors, font, mono, space } from '../theme';

const ORIGIN_LABEL: Record<ClaudeProcess['origin'], string> = {
  phone: 'Phone turn',
  mac_tab: 'Mac tab',
  headless: 'Headless',
};

// "On the Mac": the Bash commands Claude is running right now, grouped by
// session, each with Stop, then every Claude process that is open (Mac
// tabs and phone turns). Refreshes every 3 s while open. Opens as a
// full-screen sheet from the conversation list.
export default function ProcessesScreen({ onClose }: { onClose: () => void }) {
  // A Modal gets no SafeAreaView insets on iOS, so pad with the app's.
  const insets = useSafeAreaInsets();
  const procs = useProcesses(true);
  const list = procs.data?.claude ?? [];
  // Sessions with something to stop: a command running, or Claude working.
  const busy = list.filter((p) => p.commands.length > 0 || p.status === 'busy');
  const total = procs.data?.commands ?? 0;

  // Stop a whole session: its turn (a phone turn, or Esc in its Mac tab),
  // or its turn and every command it runs.
  const stopWhole = async (proc: ClaudeProcess, commands: boolean) => {
    if (!proc.session_id) return;
    try {
      Alert.alert(proc.title, describeStop(await stopSession(proc.session_id, commands)));
    } catch (e) {
      Alert.alert("Couldn't stop it", e instanceof Error ? e.message : String(e));
    } finally {
      void procs.refresh();
    }
  };
  const askStopSession = (proc: ClaudeProcess) => {
    const choose = (i: number) => {
      if (i === 0) void stopWhole(proc, false);
      else if (i === 1) void stopWhole(proc, true);
    };
    const options = ["Stop Claude's turn", 'Stop the turn and all its commands', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: proc.title, options, destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        choose,
      );
    } else {
      Alert.alert(proc.title, undefined, [
        { text: options[0], onPress: () => choose(0) },
        { text: options[1], style: 'destructive', onPress: () => choose(1) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const confirmStop = (proc: ClaudeProcess, cmd: RunningCommand) =>
    Alert.alert(
      'Stop this command?',
      `${cmd.command.slice(0, 200)}\n\nIn "${proc.title}". Claude sees that it was stopped and goes on.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => void procs.stop(cmd.pid) },
      ],
    );

  return (
    <View
      testID="processes-screen"
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.header}>
        <GlassIconButton name="close" onPress={onClose} size={40} testID="processes-close" label="Close" />
        <View style={styles.headerText}>
          <Text style={styles.title}>On the Mac</Text>
          <Text style={styles.subtitle} testID="processes-summary">
            {procs.data
              ? total === 0
                ? `Nothing running. ${list.length} Claude ${list.length === 1 ? 'session is' : 'sessions are'} open.`
                : `${total} ${total === 1 ? 'command' : 'commands'} running in ${busy.length} ${
                    busy.length === 1 ? 'session' : 'sessions'
                  }`
              : 'Loading…'}
          </Text>
        </View>
        <GlassIconButton
          name="refresh"
          onPress={() => void procs.refresh()}
          busy={procs.refreshing}
          size={40}
          testID="processes-refresh"
          label="Refresh"
        />
      </View>

      {!procs.data && !procs.error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl refreshing={procs.refreshing} onRefresh={() => void procs.refresh()} tintColor={colors.accent} />
          }
        >
          {procs.error ? (
            <Text style={styles.error} testID="processes-error">
              {procs.error}
            </Text>
          ) : null}

          {busy.map((proc) => (
            <View key={proc.pid} style={styles.group} testID={`processes-group-${proc.pid}`}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle} numberOfLines={1}>
                  {proc.title}
                </Text>
                <Text style={styles.badge}>{ORIGIN_LABEL[proc.origin]}</Text>
                {proc.session_id ? (
                  <Pressable
                    testID={`session-stop-${proc.pid}`}
                    accessibilityRole="button"
                    accessibilityLabel="Stop this session"
                    onPress={() => askStopSession(proc)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
                  >
                    <Text style={styles.stopText}>Stop</Text>
                  </Pressable>
                ) : null}
              </View>
              {proc.commands.length === 0 ? (
                <Text style={styles.commandMeta}>Claude is working (no command running)</Text>
              ) : null}
              {proc.commands.map((cmd) => (
                <View key={cmd.pid} style={styles.command} testID={`command-${cmd.pid}`}>
                  <View style={styles.commandMain}>
                    <Text style={styles.commandText} numberOfLines={4}>
                      {cmd.command}
                    </Text>
                    <Text style={styles.commandMeta}>
                      {formatDuration(cmd.elapsed)} · {cmd.cpu}% CPU
                      {cmd.processes > 1 ? ` · ${cmd.processes} processes` : ''}
                    </Text>
                  </View>
                  <Pressable
                    testID={`command-stop-${cmd.pid}`}
                    accessibilityRole="button"
                    accessibilityLabel="Stop command"
                    onPress={() => confirmStop(proc, cmd)}
                    disabled={procs.stopping === cmd.pid}
                    hitSlop={6}
                    style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
                  >
                    {procs.stopping === cmd.pid ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Text style={styles.stopText}>Stop</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          ))}

          {list.length > 0 ? <Text style={styles.sectionLabel}>Claude processes ({list.length})</Text> : null}
          {list.map((proc) => (
            <View key={`p-${proc.pid}`} style={styles.procRow} testID={`claude-${proc.pid}`}>
              <View style={[styles.dot, proc.status === 'busy' ? styles.dotBusy : styles.dotIdle]} />
              <Text style={styles.procTitle} numberOfLines={1}>
                {proc.title}
              </Text>
              <Text style={styles.procMeta}>
                {ORIGIN_LABEL[proc.origin]} · {proc.status === 'busy' ? 'working' : proc.status} ·{' '}
                {formatDuration(proc.elapsed)}
              </Text>
            </View>
          ))}

          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
            <Text style={styles.noteText}>
              Shows the Bash commands Claude runs, with keys and passwords hidden. Stop ends one command and what it
              started; the Claude session keeps going.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerText: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: font.title, fontWeight: '600' },
  subtitle: { color: colors.textDim, fontSize: font.small, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  error: { color: colors.error, fontSize: font.meta },
  group: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.sm,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  groupTitle: { flex: 1, color: colors.textPrimary, fontSize: font.body, fontWeight: '600' },
  badge: {
    color: colors.accent,
    fontSize: font.tiny,
    fontFamily: mono,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
  },
  command: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  commandMain: { flex: 1, gap: 4 },
  commandText: { color: colors.codeText, fontSize: font.small, fontFamily: mono, lineHeight: 17 },
  commandMeta: { color: colors.textFaint, fontSize: font.tiny, fontFamily: mono },
  stop: {
    minWidth: 56,
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.55)',
    backgroundColor: 'rgba(255,107,107,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopText: { color: colors.error, fontSize: font.small, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  sectionLabel: { color: colors.textFaint, fontSize: font.tiny, fontFamily: mono, marginTop: space.sm },
  procRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotBusy: { backgroundColor: colors.accent },
  dotIdle: { backgroundColor: colors.textFaint },
  procTitle: { flex: 1, color: colors.textBody, fontSize: font.small },
  procMeta: { color: colors.textFaint, fontSize: font.tiny, fontFamily: mono },
  note: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  noteText: { flex: 1, color: colors.textFaint, fontSize: font.tiny, lineHeight: 16 },
});
