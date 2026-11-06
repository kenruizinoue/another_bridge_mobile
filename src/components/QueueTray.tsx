import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { QueueItem, Steer } from '../api/sessions';
import { colors, font, mono, space } from '../theme';

// What a message sent into the running turn is doing.
export function steerLabel(steer: Steer): string {
  if (steer.state === 'sending') return 'sending…';
  if (steer.state === 'read') return 'Claude got it';
  return 'sent into this turn';
}

// Above the composer while Claude works: the messages sent into the
// running turn with their status, then the queued messages, each with
// Send now and Delete (long-press to edit), Send all now, the paused bar
// after Stop, and Undo after a delete. Pure presentation.
export default function QueueTray({
  steers,
  items,
  paused,
  lastDeleted,
  notice,
  onSendNow,
  onSendAllNow,
  onDelete,
  onEdit,
  onUndo,
  onRunQueue,
}: {
  steers: Steer[];
  items: QueueItem[];
  paused: boolean;
  lastDeleted: QueueItem | null;
  notice: string | null;
  onSendNow: (id: string) => void;
  onSendAllNow: () => void;
  onDelete: (id: string) => void;
  onEdit: (item: QueueItem) => void;
  onUndo: () => void;
  onRunQueue: () => void;
}) {
  if (!steers.length && !items.length && !lastDeleted && !notice) return null;
  return (
    <View style={styles.tray} testID="queue-tray">
      {steers.map((st) => (
        <View key={st.id} style={styles.steerRow} testID={`steer-${st.id}`}>
          <Ionicons name="return-down-forward" size={14} color={colors.accent} />
          <Text style={styles.steerText} numberOfLines={1}>
            {st.text}
          </Text>
          <Text style={[styles.steerState, st.state === 'read' && styles.steerRead]}>{steerLabel(st)}</Text>
        </View>
      ))}

      {paused && items.length > 0 ? (
        <View style={styles.pausedRow} testID="queue-paused">
          <Ionicons name="pause-circle-outline" size={16} color={colors.textDim} />
          <Text style={styles.pausedText}>
            Stopped. {items.length === 1 ? '1 queued message waits' : `${items.length} queued messages wait`} for you.
          </Text>
          <SmallButton label="Run queue" testID="queue-run" onPress={onRunQueue} primary />
        </View>
      ) : null}

      {items.length > 0 ? (
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>Queued ({items.length})</Text>
          {items.length > 1 ? <SmallButton label="Send all now" testID="queue-send-all" onPress={onSendAllNow} /> : null}
        </View>
      ) : null}
      {items.map((item, i) => (
        <View key={item.id} style={styles.itemRow} testID={`queue-item-${item.id}`}>
          <Text style={styles.itemIndex}>{i + 1}</Text>
          <Pressable
            style={styles.itemTextWrap}
            onLongPress={() => onEdit(item)}
            delayLongPress={350}
            accessibilityHint="Long-press to edit"
            testID={`queue-edit-${item.id}`}
          >
            <Text style={styles.itemText} numberOfLines={2}>
              {item.preview}
            </Text>
          </Pressable>
          <SmallButton label="Send now" testID={`queue-send-now-${item.id}`} onPress={() => onSendNow(item.id)} primary />
          <SmallButton
            icon="trash-outline"
            label="Delete"
            testID={`queue-delete-${item.id}`}
            onPress={() => onDelete(item.id)}
            iconOnly
          />
        </View>
      ))}

      {lastDeleted ? (
        <View style={styles.undoRow} testID="queue-undo-bar">
          <Text style={styles.undoText} numberOfLines={1}>
            Deleted "{lastDeleted.preview}"
          </Text>
          <SmallButton label="Undo" testID="queue-undo" onPress={onUndo} />
        </View>
      ) : null}
      {notice ? (
        <Text style={styles.notice} testID="queue-notice">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  testID,
  primary = false,
  icon,
  iconOnly = false,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  primary?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconOnly?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        primary && styles.btnPrimary,
        iconOnly && styles.btnIcon,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={primary ? '#06121d' : colors.textDim} /> : null}
      {iconOnly ? null : <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tray: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    gap: space.sm,
    backgroundColor: colors.inputBg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  steerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  steerText: { flex: 1, color: colors.textBody, fontSize: font.small },
  steerState: { color: colors.textFaint, fontSize: font.tiny, fontFamily: mono },
  steerRead: { color: colors.user },
  pausedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pausedText: { flex: 1, color: colors.textDim, fontSize: font.small },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { color: colors.textFaint, fontSize: font.tiny, fontFamily: mono },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  itemIndex: { width: 14, color: colors.textFaint, fontSize: font.tiny, fontFamily: mono, textAlign: 'center' },
  itemTextWrap: { flex: 1 },
  itemText: { color: colors.textBody, fontSize: font.small },
  undoRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  undoText: { flex: 1, color: colors.textDim, fontSize: font.small },
  notice: { color: colors.textDim, fontSize: font.tiny },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: space.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnIcon: { width: 28, paddingHorizontal: 0, justifyContent: 'center', borderColor: colors.borderStrong },
  btnText: { color: colors.accent, fontSize: font.tiny, fontWeight: '600' },
  btnTextPrimary: { color: '#06121d' },
  pressed: { opacity: 0.6 },
});
