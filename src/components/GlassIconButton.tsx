import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// A circular, translucent "glass" icon button using real Ionicons. Used
// for the header refresh, the composer attach, and send. `filled` gives
// the accent-tinted active look; `busy` swaps the icon for a spinner.
export default function GlassIconButton({
  name,
  onPress,
  disabled = false,
  busy = false,
  filled = false,
  size = 40,
  testID,
}: {
  name: IoniconName;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  filled?: boolean;
  size?: number;
  testID?: string;
}) {
  const iconColor = filled ? '#06121d' : disabled ? colors.textDim : colors.accent;
  return (
    <Pressable
      testID={testID}
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
        <Ionicons name={name} size={Math.round(size * 0.52)} color={iconColor} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  glass: {
    backgroundColor: 'rgba(94,177,255,0.12)', // accent @ low alpha → glassy
    borderColor: 'rgba(94,177,255,0.35)',
  },
  filled: { backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { backgroundColor: 'rgba(125,138,153,0.10)', borderColor: 'rgba(125,138,153,0.25)' },
  pressed: { opacity: 0.6 },
});
