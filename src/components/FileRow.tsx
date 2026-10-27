import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { fileSource, formatSize, type FileEntry, type FileKind } from '../api/files';
import { relativeTime } from '../lib/time';
import { colors, font, mono, space } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<FileKind, IoniconName> = {
  dir: 'folder-outline',
  video: 'film-outline',
  image: 'image-outline',
  audio: 'musical-notes-outline',
  pdf: 'document-attach-outline',
  text: 'document-text-outline',
  other: 'document-outline',
};

// One entry in a folder. Images and folders with a cover show a thumbnail
// fetched through the bridge; everything else shows its type icon.
export default function FileRow({
  root,
  entry,
  onPress,
}: {
  root: string;
  entry: FileEntry;
  onPress: (entry: FileEntry) => void;
}) {
  const thumb = entry.kind === 'image' ? entry.path : entry.preview ?? null;
  const meta = [entry.kind === 'dir' ? 'folder' : formatSize(entry.size), relativeTime(entry.modified)]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      testID={`file-row-${entry.path}`}
      accessibilityRole="button"
      accessibilityLabel={`${entry.kind === 'dir' ? 'Folder' : 'File'} ${entry.name}`}
      onPress={() => onPress(entry)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.thumbBox}>
        {thumb ? (
          <Image source={fileSource(root, thumb)} style={styles.thumb} resizeMode="cover" />
        ) : (
          <Ionicons name={ICONS[entry.kind]} size={22} color={entry.kind === 'dir' ? colors.accent : colors.tool} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {entry.kind === 'dir' ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  thumbBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: 44, height: 44 },
  body: { flex: 1, gap: 2 },
  name: { color: colors.textPrimary, fontSize: font.body, fontFamily: mono },
  meta: { color: colors.textDim, fontSize: font.tiny, fontFamily: mono },
});
