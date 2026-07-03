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
import { colors, font, mono, space } from '../theme';
import GlassIconButton from './GlassIconButton';

function prettySize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

// The message composer: attachment strip (image thumbnails + file chips)
// plus the input row — a single + button (action sheet: photos or files),
// growing text input, send button. Pure presentation; all state lives in
// the screen's hooks.
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

      <View style={styles.inputRow}>
        <GlassIconButton
          name="add"
          onPress={openAttachMenu}
          disabled={!canAttachImages && !canAttachFiles}
          size={38}
          testID="composer-attach"
        />
        <TextInput
          testID="composer-input"
          style={styles.input}
          value={draft}
          onChangeText={onChangeDraft}
          // Always editable — typing while a turn runs QUEUES the message.
          placeholder={busy ? 'Queue a message…' : 'Message… (continues this session)'}
          placeholderTextColor="#4a5666"
          multiline
        />
        <GlassIconButton
          name="arrow-up"
          onPress={onSend}
          disabled={!hasContent}
          filled={hasContent}
          size={40}
          testID="composer-send"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.inputBg,
  },
  input: {
    flex: 1,
    color: colors.textBody,
    fontSize: font.title,
    fontFamily: mono,
    lineHeight: 20,
    // Single line renders exactly 20 + 9 + 9 = 38px — the attach button's
    // height — so with the row's alignItems: 'center' the input, attach,
    // and send all share a vertical center instead of drifting a few px.
    minHeight: 38,
    maxHeight: 110,
    paddingVertical: 9,
    paddingHorizontal: 0,
  },
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
