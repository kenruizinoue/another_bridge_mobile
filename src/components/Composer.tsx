import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Attachment, FileAttachment } from '../hooks/useAttachments';
import type { SendMode } from '../hooks/useChatSession';
import type { VoiceStatus } from '../hooks/useVoiceInput';
import { colors, font, mono, space } from '../theme';
import AttachmentStrip from './AttachmentStrip';
import GlassIconButton from './GlassIconButton';

// The message composer: attachment strip (image thumbnails + file chips)
// plus the input row — a + button (action sheet: photos or files), a mic
// button (dictation into the draft, never auto-send), growing text input,
// send button. Pure presentation; all state lives in the screen's hooks.
export default function Composer({
  draft,
  onChangeDraft,
  attachments,
  files,
  onPickImages,
  onPickFiles,
  onRemoveAttachment,
  onRemoveFile,
  canAttachImages,
  canAttachFiles,
  busy,
  voiceStatus,
  onMicPress,
  onConversationPress,
  onSend,
  mode = 'after',
  onModeChange,
  nowAvailable = true,
  nowReason = null,
  running = false,
  onStop,
}: {
  draft: string;
  onChangeDraft: (text: string) => void;
  attachments: Attachment[];
  files: FileAttachment[];
  onPickImages: () => void;
  onPickFiles: () => void;
  onRemoveAttachment: (uri: string) => void;
  onRemoveFile: (uri: string) => void;
  canAttachImages: boolean;
  canAttachFiles: boolean;
  busy: boolean; // a turn is running / queued → sending will queue
  voiceStatus: VoiceStatus;
  onMicPress: () => void;
  // Hands-free conversation mode toggle (the waveform button). The mic
  // stays dictation-into-draft; this enters the listen/speak loop.
  onConversationPress?: () => void;
  onSend: () => void;
  // 1.9.0, while Claude works: send "now" (into the running turn) or
  // "after" (queue). The switch shows only while busy with something typed.
  mode?: SendMode;
  onModeChange?: (mode: SendMode) => void;
  nowAvailable?: boolean;
  nowReason?: string | null; // why "now" is off, shown under the switch
  running?: boolean; // a phone turn is running, so Stop can end it
  onStop?: () => void; // shown in place of send while the input is empty
}) {
  const hasContent = !!draft.trim() || attachments.length > 0 || files.length > 0;
  const showSwitch = busy && hasContent && !!onModeChange;
  const effectiveMode: SendMode = showSwitch && mode === 'now' && nowAvailable ? 'now' : 'after';
  const showStop = running && !hasContent && !!onStop;

  // One + entry point → iOS action sheet (Alert buttons on Android).
  const openAttachMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Photo Library', 'Files', 'Cancel'], cancelButtonIndex: 2 },
        (i) => {
          if (i === 0) onPickImages();
          else if (i === 1) onPickFiles();
        },
      );
    } else {
      Alert.alert('Attach', undefined, [
        { text: 'Photo Library', onPress: onPickImages },
        { text: 'Files', onPress: onPickFiles },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <>
      <AttachmentStrip
        attachments={attachments}
        files={files}
        onRemoveAttachment={onRemoveAttachment}
        onRemoveFile={onRemoveFile}
      />

      {/* Claude-app style card: the input gets the full top row (grows to
          7 lines, then scrolls); all buttons live on the row below. */}
      <View style={styles.composerWrap}>
        {showSwitch ? (
          <View style={styles.modeRow} testID="composer-mode">
            <Text style={styles.modeLabel}>Send</Text>
            <ModeChip
              label="Now"
              testID="composer-mode-now"
              selected={effectiveMode === 'now'}
              disabled={!nowAvailable}
              onPress={() => onModeChange?.('now')}
            />
            <ModeChip
              label="After this turn"
              testID="composer-mode-after"
              selected={effectiveMode === 'after'}
              onPress={() => onModeChange?.('after')}
            />
          </View>
        ) : null}
        {showSwitch && !nowAvailable && nowReason ? (
          <Text style={styles.modeReason} testID="composer-mode-reason">
            {nowReason}
          </Text>
        ) : null}
        <View style={styles.card}>
          <TextInput
            testID="composer-input"
            style={styles.input}
            value={draft}
            onChangeText={onChangeDraft}
            // Always editable — typing while a turn runs QUEUES the message.
            placeholder={
              voiceStatus === 'recording'
                ? 'Recording… tap stop to transcribe'
                : voiceStatus === 'transcribing'
                  ? 'Transcribing…'
                  : busy
                    ? onModeChange
                      ? effectiveMode === 'now' && nowAvailable
                        ? 'Add to what Claude is doing…'
                        : 'Queue for after this turn…'
                      : 'Queue a message…'
                    : 'Message… (continues this session)'
            }
            placeholderTextColor="#4a5666"
            multiline
          />
          <View style={styles.buttonRow}>
            <GlassIconButton
              name="add"
              onPress={openAttachMenu}
              disabled={!canAttachImages && !canAttachFiles}
              size={36}
              testID="composer-attach"
            />
            <GlassIconButton
              name={voiceStatus === 'recording' ? 'stop' : 'mic'}
              onPress={onMicPress}
              busy={voiceStatus === 'transcribing'}
              filled={voiceStatus === 'recording'}
              size={36}
              testID="composer-mic"
            />
            {onConversationPress ? (
              <GlassIconButton
                name="pulse"
                onPress={onConversationPress}
                size={36}
                testID="composer-conversation"
              />
            ) : null}
            <View style={styles.buttonSpacer} />
            {showStop ? (
              <Pressable
                testID="composer-stop"
                accessibilityRole="button"
                accessibilityLabel="Stop"
                onPress={onStop}
                hitSlop={8}
                style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
              >
                <View style={styles.stopSquare} />
              </Pressable>
            ) : (
              <GlassIconButton
                name={showSwitch && effectiveMode === 'after' ? 'time-outline' : 'arrow-up'}
                onPress={onSend}
                disabled={!hasContent}
                filled={hasContent}
                size={36}
                testID="composer-send"
                label={showSwitch ? (effectiveMode === 'now' ? 'Send now' : 'Queue for after this turn') : 'Send'}
              />
            )}
          </View>
        </View>
      </View>
    </>
  );
}

function ModeChip({
  label,
  selected,
  disabled = false,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected, disabled && styles.chipTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.sm, paddingHorizontal: 2 },
  modeLabel: { color: colors.textFaint, fontSize: font.small, fontFamily: mono },
  modeReason: { color: colors.textFaint, fontSize: font.tiny, paddingBottom: space.sm, paddingHorizontal: 2 },
  chip: {
    height: 28,
    paddingHorizontal: space.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipDisabled: { borderColor: 'rgba(125,138,153,0.25)' },
  chipText: { color: colors.accent, fontSize: font.small, fontWeight: '600' },
  chipTextSelected: { color: '#06121d' },
  chipTextDisabled: { color: colors.textDim },
  stop: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.55)',
    backgroundColor: 'rgba(255,107,107,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: { width: 12, height: 12, borderRadius: 2, backgroundColor: colors.error },
  pressed: { opacity: 0.6 },
  composerWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.bg,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  input: {
    color: colors.textBody,
    fontSize: font.body,
    fontFamily: mono,
    lineHeight: 18,
    // Grows to exactly 7 lines (7 × 18 = 126) before scrolling.
    maxHeight: 126,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 2,
    marginBottom: space.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  buttonSpacer: { flex: 1 },
});
