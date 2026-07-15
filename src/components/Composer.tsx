import { Ionicons } from '@expo/vector-icons';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Attachment, FileAttachment } from '../hooks/useAttachments';
import type { VoiceStatus } from '../hooks/useVoiceInput';
import { colors, font, mono, space } from '../theme';
import GlassIconButton from './GlassIconButton';

function prettySize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

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
  onSend,
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
  onSend: () => void;
}) {
  const hasContent = !!draft.trim() || attachments.length > 0 || files.length > 0;

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
      {attachments.length > 0 || files.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.thumbStrip}
          contentContainerStyle={styles.thumbStripContent}
        >
          {attachments.map((a) => (
            <View key={a.uri} style={styles.thumbWrap}>
              <Image source={{ uri: a.uri }} style={styles.thumb} />
              <Pressable
                testID={`thumb-remove-${a.uri}`}
                onPress={() => onRemoveAttachment(a.uri)}
                hitSlop={6}
                style={styles.thumbRemove}
              >
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
          {files.map((f) => (
            <View key={f.uri} style={styles.fileChip} testID={`file-chip-${f.uri}`}>
              <Ionicons name="document-text-outline" size={18} color={colors.accent} />
              <View style={styles.fileMeta}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={styles.fileSize}>{prettySize(f.size)}</Text>
              </View>
              <Pressable
                testID={`file-remove-${f.uri}`}
                onPress={() => onRemoveFile(f.uri)}
                hitSlop={6}
                style={styles.thumbRemove}
              >
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* Claude-app style card: the input gets the full top row (grows to
          7 lines, then scrolls); all buttons live on the row below. */}
      <View style={styles.composerWrap}>
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
                    ? 'Queue a message…'
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
            <View style={styles.buttonSpacer} />
            <GlassIconButton
              name="arrow-up"
              onPress={onSend}
              disabled={!hasContent}
              filled={hasContent}
              size={36}
              testID="composer-send"
            />
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
  thumbStrip: { backgroundColor: colors.inputBg, borderTopWidth: 1, borderTopColor: colors.divider },
  thumbStripContent: { padding: space.sm, gap: space.sm },
  thumbWrap: { width: 60, height: 60 },
  thumb: { width: 60, height: 60, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 60,
    maxWidth: 190,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fileMeta: { flexShrink: 1 },
  fileName: { color: colors.textBody, fontSize: font.small, fontFamily: mono },
  fileSize: { color: colors.textFaint, fontSize: font.tiny, fontFamily: mono, marginTop: 2 },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
