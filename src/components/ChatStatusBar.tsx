import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, font, mono, space } from '../theme';

// The strip above the composer: queued messages waiting on the Mac, the
// working/syncing indicator while a turn runs, or the last send error.
export default function ChatStatusBar({
  queued,
  sending,
  syncing,
  streaming,
  sendError,
}: {
  queued: string[];
  sending: boolean;
  syncing: boolean;
  streaming: boolean;
  sendError: string | null;
}) {
  return (
    <>
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
        <View style={styles.bar}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.workingText}>
            {syncing
              ? queued.length > 0
                ? `syncing — ${queued.length} queued…`
                : 'reconnecting — syncing from the Mac…'
              : streaming
                ? 'streaming…'
                : 'claude is working on the Mac…'}
          </Text>
        </View>
      ) : sendError ? (
        <View style={styles.bar}>
          <Text style={styles.errorText} numberOfLines={2}>
            ✕ {sendError}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
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
  errorText: { color: colors.error, fontSize: font.small, fontFamily: mono, flex: 1 },
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
