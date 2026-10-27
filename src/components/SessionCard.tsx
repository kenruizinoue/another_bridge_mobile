import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionCard as Card } from '../api/types';
import { relativeTime } from '../lib/time';
import { colors, font, mono, space } from '../theme';
import { terminalLabel } from './ChatStatusBar';

// One conversation card. Tapping opens the conversation view.
export default function SessionCard({
  card,
  onPress,
}: {
  card: Card;
  onPress?: (card: Card) => void;
}) {
  return (
    <Pressable
      testID={`session-card-${card.session_id}`}
      onPress={() => onPress?.(card)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.title} numberOfLines={2}>
        {card.title}
      </Text>

      <View style={styles.metaRow}>
        <Text style={styles.project} numberOfLines={1}>
          {card.project}
        </Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.meta}>{card.message_count} msgs</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.meta}>{relativeTime(card.last_activity)}</Text>
      </View>

      {card.cwd ? (
        <Text style={styles.cwd} numberOfLines={1} ellipsizeMode="head">
          {card.cwd}
        </Text>
      ) : null}

      {card.terminal?.active ? (
        // Working in a terminal tab right now: a message sent from the
        // phone waits until it's done, so check here before asking.
        <View style={styles.terminalRow} testID={`session-terminal-${card.session_id}`}>
          <View style={styles.terminalDot} />
          <Text style={styles.terminalText} numberOfLines={1}>
            {terminalLabel(card.terminal)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space.lg,
    marginHorizontal: space.lg,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.surfacePressed, borderColor: colors.borderStrong },
  title: { color: colors.textPrimary, fontSize: font.title, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  project: { color: colors.accent, fontSize: font.meta, fontWeight: '500', maxWidth: '55%' },
  meta: { color: colors.textDim, fontSize: font.meta },
  dot: { color: '#3a4757', fontSize: font.meta, marginHorizontal: 6 },
  cwd: { color: colors.textFaint, fontSize: font.tiny, fontFamily: mono, marginTop: space.sm },
  terminalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  terminalDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  terminalText: { color: colors.accent, fontSize: font.meta, fontFamily: mono, flexShrink: 1 },
});
