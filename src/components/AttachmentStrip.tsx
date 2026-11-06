import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Attachment, FileAttachment } from '../hooks/useAttachments';
import { colors, font, mono, space } from '../theme';

function prettySize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

// The picked photos (thumbnails) and files (chips), each with a remove
// button, in one horizontal strip. Renders nothing when empty. Shared by
// the chat composer and the new-session form.
export default function AttachmentStrip({
  attachments,
  files,
  onRemoveAttachment,
  onRemoveFile,
  framed = true,
}: {
  attachments: Attachment[];
  files: FileAttachment[];
  onRemoveAttachment: (uri: string) => void;
  onRemoveFile: (uri: string) => void;
  framed?: boolean; // the composer's top-bordered band; false inside a form
}) {
  if (attachments.length === 0 && files.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={framed ? styles.strip : null}
      contentContainerStyle={[styles.content, !framed && styles.contentBare]}
    >
      {attachments.map((a) => (
        <View key={a.uri} style={styles.thumbWrap}>
          <Image source={{ uri: a.uri }} style={styles.thumb} />
          <Pressable
            testID={`thumb-remove-${a.uri}`}
            onPress={() => onRemoveAttachment(a.uri)}
            hitSlop={6}
            style={styles.remove}
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
            style={styles.remove}
          >
            <Ionicons name="close" size={13} color="#fff" />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { backgroundColor: colors.inputBg, borderTopWidth: 1, borderTopColor: colors.divider },
  content: { padding: space.sm, gap: space.sm },
  contentBare: { paddingHorizontal: 0, paddingTop: space.sm },
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
  remove: {
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
