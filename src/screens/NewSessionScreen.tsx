import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OutgoingFile, OutgoingImage } from '../api/sessions';
import type { SessionCard } from '../api/types';
import AttachmentStrip from '../components/AttachmentStrip';
import GlassIconButton from '../components/GlassIconButton';
import useAttachments, { MAX_FILES, MAX_IMAGES } from '../hooks/useAttachments';
import useNewSession from '../hooks/useNewSession';
import useVoiceInput from '../hooks/useVoiceInput';
import { colors, font, mono, space } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Start a brand-new Claude Code session on the Mac. A top-aligned form:
// the first message (the main field, focused on open) with labeled
// Photos, Files and Dictate buttons under it, then an optional name. Start
// sits in the header, so it stays reachable above the keyboard. Once the
// bridge says the session exists, `onCreated` opens its chat, which shows
// the first reply streaming in.
export default function NewSessionScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (card: SessionCard) => void;
}) {
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  const images = useAttachments(setPickError);
  const session = useNewSession(onCreated);
  const voice = useVoiceInput({
    onText: (text) =>
      setDraft((current) => (current.trim() ? `${current.replace(/\s+$/, '')} ${text}` : text)),
    onError: setPickError,
  });

  const hasContent = !!draft.trim() || images.attachments.length > 0 || images.files.length > 0;
  const canStart = hasContent && !session.starting;

  const handleStart = useCallback(() => {
    const message = draft.trim();
    const out: OutgoingImage[] = images.attachments.map((a) => ({ media_type: 'image/jpeg', data: a.base64 }));
    const outFiles: OutgoingFile[] = images.files.map((f) => ({ name: f.name, data: f.base64 }));
    if (!message && out.length === 0 && outFiles.length === 0) return;
    const sentImages = images.attachments;
    const sentFiles = images.files;
    setPickError(null);
    setDraft('');
    images.clear();
    session.start(message, name, out, outFiles, () => {
      setDraft(message);
      images.restore(sentImages, sentFiles);
    });
  }, [draft, images, name, session]);

  const error = session.error ?? pickError;
  const recording = voice.status === 'recording';
  const transcribing = voice.status === 'transcribing';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <GlassIconButton name="chevron-back" onPress={onBack} size={40} testID="new-back" label="Back" />
        <Text style={styles.title}>New session</Text>
        <Pressable
          testID="new-start"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canStart }}
          onPress={handleStart}
          disabled={!canStart}
          style={({ pressed }) => [styles.start, !canStart && styles.startDisabled, pressed && styles.pressed]}
        >
          {session.starting ? (
            <ActivityIndicator size="small" color="#06121d" />
          ) : (
            <Ionicons name="arrow-up" size={16} color={canStart ? '#06121d' : colors.textDim} />
          )}
          <Text style={[styles.startText, !canStart && styles.startTextDisabled]}>
            {session.starting ? 'Starting' : 'Start'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text style={styles.label}>First message</Text>
          <TextInput
            testID="new-message"
            value={draft}
            onChangeText={setDraft}
            placeholder={
              recording
                ? 'Recording… tap Stop to transcribe'
                : transcribing
                  ? 'Transcribing…'
                  : 'What should Claude work on?'
            }
            placeholderTextColor={colors.textFaint}
            style={styles.messageInput}
            multiline
            autoFocus
            editable={!session.starting}
            textAlignVertical="top"
          />
          <AttachmentStrip
            attachments={images.attachments}
            files={images.files}
            onRemoveAttachment={images.remove}
            onRemoveFile={images.removeFile}
            framed={false}
          />
          <View style={styles.actions}>
            <ActionPill
              icon="images-outline"
              label="Photos"
              testID="new-photos"
              disabled={session.starting || images.attachments.length >= MAX_IMAGES}
              onPress={() => {
                setPickError(null);
                void images.pick();
              }}
            />
            <ActionPill
              icon="document-attach-outline"
              label="Files"
              testID="new-files"
              disabled={session.starting || images.files.length >= MAX_FILES}
              onPress={() => {
                setPickError(null);
                void images.pickFiles();
              }}
            />
            <ActionPill
              icon={recording ? 'stop' : 'mic-outline'}
              label={recording ? 'Stop' : transcribing ? 'Transcribing' : 'Dictate'}
              testID="new-mic"
              active={recording}
              busy={transcribing}
              disabled={session.starting}
              onPress={() => {
                setPickError(null);
                voice.toggle();
              }}
            />
          </View>

          <Text style={[styles.label, styles.labelSpaced]}>Name (optional)</Text>
          <TextInput
            testID="new-name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. 2026/Nov/5 Errands"
            placeholderTextColor={colors.textFaint}
            style={styles.nameInput}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={120}
            editable={!session.starting}
            returnKeyType="done"
          />

          <View style={styles.info}>
            <Ionicons name="desktop-outline" size={14} color={colors.textFaint} />
            <Text style={styles.infoText}>
              Runs in your home folder on the Mac. Without a name, Claude titles it from the first message. To
              continue it on the Mac, tap the screen button in the chat.
            </Text>
          </View>

          {session.starting ? (
            <View style={styles.status} testID="new-starting">
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.statusText}>Starting the session on the Mac…</Text>
            </View>
          ) : null}
          {error ? (
            <Text style={styles.error} testID="new-error">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// A labeled glass button for the form's attach and dictate actions.
function ActionPill({
  icon,
  label,
  onPress,
  disabled = false,
  active = false,
  busy = false,
  testID,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  busy?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy }}
      onPress={onPress}
      disabled={disabled || busy}
      hitSlop={4}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        (disabled || busy) && styles.pillDisabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons name={icon} size={16} color={active ? '#06121d' : disabled ? colors.textDim : colors.accent} />
      )}
      <Text style={[styles.pillText, active && styles.pillTextActive, disabled && styles.pillTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
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
  title: { flex: 1, color: colors.textPrimary, fontSize: font.title, fontWeight: '600' },
  start: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: space.lg,
    borderRadius: 18,
    backgroundColor: colors.accent,
  },
  startDisabled: { backgroundColor: 'rgba(125,138,153,0.14)' },
  startText: { color: '#06121d', fontSize: font.body, fontWeight: '700' },
  startTextDisabled: { color: colors.textDim },
  pressed: { opacity: 0.6 },
  body: { padding: space.xl, paddingBottom: space.xl * 2 },
  label: { color: colors.textDim, fontSize: font.small, fontFamily: mono, marginBottom: space.sm },
  labelSpaced: { marginTop: space.xl },
  messageInput: {
    minHeight: 140,
    maxHeight: 260,
    color: colors.textBody,
    fontSize: font.title,
    lineHeight: 22,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
    backgroundColor: 'rgba(94,177,255,0.12)',
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillDisabled: { backgroundColor: 'rgba(125,138,153,0.10)', borderColor: 'rgba(125,138,153,0.25)' },
  pillText: { color: colors.accent, fontSize: font.body, fontWeight: '600' },
  pillTextActive: { color: '#06121d' },
  pillTextDisabled: { color: colors.textDim },
  nameInput: {
    height: 44,
    color: colors.textBody,
    fontSize: font.title,
    paddingHorizontal: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  info: { flexDirection: 'row', gap: space.sm, marginTop: space.lg, paddingRight: space.md },
  infoText: { flex: 1, color: colors.textFaint, fontSize: font.small, lineHeight: 17 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  statusText: { color: colors.textDim, fontSize: font.meta, fontFamily: mono },
  error: { color: colors.error, fontSize: font.meta, marginTop: space.lg },
});
