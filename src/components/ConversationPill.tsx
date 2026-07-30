import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationState } from '../lib/voice/conversationMachine';
import { colors, font, mono, space } from '../theme';
import GlassIconButton from './GlassIconButton';

const STATE_LABEL: Record<Exclude<ConversationState, 'idle'>, string> = {
  listening: 'Listening…',
  transcribing: 'Transcribing…',
  confirming: 'Sending in a moment…',
  waitingReply: 'Thinking… tap to silence',
  speaking: 'Speaking… tap to interrupt',
};

// Replaces the composer while conversation mode is on: one pill showing
// the loop state, the pending transcript with its cancel window, and the
// exit button. Tapping the pill during speech interrupts the voice and
// hands the turn back to the user. Pure presentation; the hook owns state.
export default function ConversationPill({
  state,
  transcript,
  onCancel,
  onInterrupt,
  onExit,
}: {
  state: ConversationState;
  transcript: string | null;
  onCancel: () => void;
  onInterrupt: () => void;
  onExit: () => void;
}) {
  if (state === 'idle') return null;
  return (
    <View style={styles.wrap}>
      <Pressable
        testID="conversation-pill"
        style={styles.pill}
        onPress={state === 'speaking' || state === 'waitingReply' ? onInterrupt : undefined}
      >
        <Ionicons
          name={state === 'speaking' ? 'volume-high' : 'pulse'}
          size={16}
          color={colors.accent}
        />
        <View style={styles.body}>
          <Text style={styles.label}>{STATE_LABEL[state]}</Text>
          {state === 'confirming' && transcript ? (
            <Text style={styles.transcript} numberOfLines={2} testID="conversation-transcript">
              {transcript}
            </Text>
          ) : null}
        </View>
        {state === 'confirming' ? (
          <Pressable testID="conversation-cancel" onPress={onCancel} hitSlop={8} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}
        <GlassIconButton name="close" onPress={onExit} size={32} testID="conversation-exit" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.bg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  body: { flex: 1 },
  label: { color: colors.textBody, fontSize: font.body, fontFamily: mono },
  transcript: { color: colors.textDim, fontSize: font.small, fontFamily: mono, marginTop: 2 },
  cancel: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  cancelText: { color: colors.error, fontSize: font.small, fontFamily: mono },
});
