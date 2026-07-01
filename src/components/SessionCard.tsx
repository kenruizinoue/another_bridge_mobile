import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionCard as Card } from '../api/types';
import { relativeTime } from '../lib/time';
import { colors, font, mono, space } from '../theme';

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
});
