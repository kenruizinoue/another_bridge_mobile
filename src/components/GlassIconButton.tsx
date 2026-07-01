import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, mono } from '../theme';

// A circular, translucent "glass" icon button. Used for the header
// refresh and the composer send. `filled` gives the accent-tinted active
// look (send when there's text); `busy` swaps the glyph for a spinner.
export default function GlassIconButton({
  glyph,
  onPress,
  disabled = false,
  busy = false,
  filled = false,
  size = 40,
}: {
  glyph: string;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  filled?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        filled ? styles.filled : styles.glass,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={filled ? '#06121d' : colors.accent} />
      ) : (
        <Text
          style={[
            styles.glyph,
            { fontSize: size * 0.5 },
            filled ? styles.glyphFilled : styles.glyphGlass,
          ]}
        >
          {glyph}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  glass: {
    backgroundColor: 'rgba(94,177,255,0.12)', // accent @ low alpha → glassy
    borderColor: 'rgba(94,177,255,0.35)',
  },
  filled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  disabled: {
    backgroundColor: 'rgba(125,138,153,0.10)',
    borderColor: 'rgba(125,138,153,0.25)',
  },
  pressed: { opacity: 0.6 },
  glyph: { fontFamily: mono, fontWeight: '700', includeFontPadding: false, lineHeight: undefined },
  glyphGlass: { color: colors.accent },
  glyphFilled: { color: '#06121d' },
});
