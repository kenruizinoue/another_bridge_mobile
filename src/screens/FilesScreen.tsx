import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FileEntry } from '../api/files';
import FileRow from '../components/FileRow';
import FileViewer, { type FileActions } from '../components/FileViewer';
import GlassIconButton from '../components/GlassIconButton';
import useFileBrowser, { type FilesGateway } from '../hooks/useFileBrowser';
import { colors, font, mono, space } from '../theme';

// Browse the folders the bridge shares (ANOTHER_BRIDGE_FILE_ROOTS on the
// Mac), newest first, and open a file in the viewer. Opens on a tapped
// chat path when one is given.
export default function FilesScreen({
  onClose,
  initialPath,
  gateway,
  fileActions,
}: {
  onClose: () => void;
  initialPath?: string | null;
  gateway?: FilesGateway;
  fileActions?: FileActions;
}) {
  const files = useFileBrowser({ initialPath, gateway });
  // Files opens in a Modal, where SafeAreaView gets no insets on iOS, so pad
  // with the app's insets to keep the header below the status bar.
  const insets = useSafeAreaInsets();
  const { location, listing, viewing } = files;

  const title = viewing ? viewing.name : location ? (location.path ? lastPart(location.path) : files.rootLabel) : 'Files';
  const crumb = location ? [files.rootLabel, location.path].filter(Boolean).join('/') : 'Shared folders';

  const goBack = () => {
    if (!files.back()) onClose();
  };

  return (
    <View
      testID="files-screen"
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <View style={styles.header}>
        <GlassIconButton name="chevron-back" onPress={goBack} size={40} testID="files-back" label="Back" />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <GlassIconButton name="close" onPress={onClose} size={40} testID="files-close" label="Close files" />
      </View>
      <Text style={styles.crumb} numberOfLines={1} ellipsizeMode="head">
        {crumb}
      </Text>

      {viewing && location ? (
        <FileViewer root={location.root} entry={viewing} fileActions={fileActions} />
      ) : files.loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Loading…</Text>
        </View>
      ) : files.error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t load</Text>
          <Text style={styles.errorMsg}>{files.error}</Text>
          <Pressable testID="files-retry" accessibilityRole="button" onPress={files.retry} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : !location ? (
        <RootList files={files} />
      ) : (
        <FlatList
          testID="files-list"
          data={listing?.entries ?? []}
          keyExtractor={(item: FileEntry) => item.path}
          renderItem={({ item }) => <FileRow root={location.root} entry={item} onPress={files.open} />}
          refreshControl={
            <RefreshControl refreshing={files.refreshing} onRefresh={files.refresh} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.dim}>This folder is empty.</Text>
            </View>
          }
          ListFooterComponent={
            listing?.truncated ? <Text style={styles.dim}>Showing the newest 500 items.</Text> : null
          }
        />
      )}
    </View>
  );
}

function RootList({ files }: { files: ReturnType<typeof useFileBrowser> }) {
  if (!files.roots || files.roots.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>No shared folders yet.</Text>
        <Text style={styles.hint}>Add ANOTHER_BRIDGE_FILE_ROOTS to the bridge .env on the Mac and restart it.</Text>
      </View>
    );
  }
  return (
    <FlatList
      testID="files-roots"
      data={files.roots}
      keyExtractor={(r) => r.name}
      renderItem={({ item }) => (
        <FileRow
          root={item.name}
          entry={{ name: item.label, path: `root:${item.name}`, kind: 'dir', size: null, modified: Date.now() / 1000 }}
          onPress={() => files.openRoot(item.name)}
        />
      )}
    />
  );
}

function lastPart(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  title: { color: colors.textPrimary, fontSize: font.title, fontWeight: '600', flex: 1 },
  crumb: {
    color: colors.textFaint,
    fontSize: font.tiny,
    fontFamily: mono,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: space.sm },
  dim: { color: colors.textDim, fontSize: font.meta, textAlign: 'center', padding: space.md },
  hint: { color: colors.textFaint, fontSize: font.small, fontFamily: mono, textAlign: 'center' },
  errorTitle: { color: colors.error, fontSize: font.title, fontWeight: '600' },
  errorMsg: { color: '#c0c9d4', fontSize: font.meta, textAlign: 'center' },
  retry: {
    marginTop: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
  },
  retryText: { color: colors.accent, fontSize: font.meta, fontFamily: mono },
});
