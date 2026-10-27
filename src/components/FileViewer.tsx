import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import {
  fetchText,
  fileSource,
  formatSize,
  MAX_PDF_PREVIEW_BYTES,
  MAX_TEXT_PREVIEW_BYTES,
  type FileEntry,
} from '../api/files';
import * as actions from '../lib/files/fileActions';
import { colors, font, mono, space } from '../theme';
import Markdown from './Markdown';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type FileActions = Pick<typeof actions, 'saveToPhotos' | 'shareFile' | 'copyText' | 'downloadToCache'>;

// Shows one file from a shared folder: videos play, images, text and PDFs
// show in place, and anything else opens through the share sheet. The
// action bar saves to Photos, shares, or copies text (like a post caption).
export default function FileViewer({
  root,
  entry,
  fileActions = actions,
  loadText = fetchText,
}: {
  root: string;
  entry: FileEntry;
  fileActions?: FileActions;
  loadText?: typeof fetchText;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  const run = async (label: string, work: () => Promise<void>, done?: string) => {
    setBusy(label);
    setNote(null);
    try {
      await work();
      if (done) setNote(done);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const canSave = entry.kind === 'video' || entry.kind === 'image';
  const isText = entry.kind === 'text';

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        {entry.kind === 'video' ? (
          <VideoPane root={root} entry={entry} />
        ) : entry.kind === 'image' ? (
          <Image
            testID="file-image"
            source={fileSource(root, entry.path)}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={entry.name}
          />
        ) : isText ? (
          <TextPane root={root} entry={entry} loadText={loadText} onText={setText} />
        ) : entry.kind === 'pdf' ? (
          <PdfPane root={root} entry={entry} download={fileActions.downloadToCache} />
        ) : (
          <View style={styles.center}>
            <Ionicons name="document-outline" size={48} color={colors.tool} />
            <Text style={styles.name}>{entry.name}</Text>
            {entry.size != null ? <Text style={styles.dim}>{formatSize(entry.size)}</Text> : null}
            <Text style={styles.dim}>Open it with Share to preview or save it.</Text>
          </View>
        )}
      </View>

      {note ? (
        <Text style={styles.note} testID="file-note">
          {note}
        </Text>
      ) : null}

      <View style={styles.bar}>
        {canSave ? (
          <ActionButton
            icon="download-outline"
            label="Save to Photos"
            busy={busy === 'save'}
            disabled={!!busy}
            testID="file-save"
            onPress={() => run('save', () => fileActions.saveToPhotos(root, entry), 'Saved to Photos.')}
          />
        ) : null}
        {isText ? (
          <ActionButton
            icon="copy-outline"
            label="Copy"
            busy={busy === 'copy'}
            disabled={!!busy || text == null}
            testID="file-copy"
            onPress={() => run('copy', () => fileActions.copyText(text ?? ''), 'Copied.')}
          />
        ) : null}
        <ActionButton
          icon="share-outline"
          label="Share"
          busy={busy === 'share'}
          disabled={!!busy}
          testID="file-share"
          onPress={() => run('share', () => fileActions.shareFile(root, entry))}
        />
      </View>
    </View>
  );
}

function VideoPane({ root, entry }: { root: string; entry: FileEntry }) {
  const player = useVideoPlayer(fileSource(root, entry.path), (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      testID="file-video"
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

function TextPane({
  root,
  entry,
  loadText,
  onText,
}: {
  root: string;
  entry: FileEntry;
  loadText: typeof fetchText;
  onText: (text: string | null) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tooBig = entry.size != null && entry.size > MAX_TEXT_PREVIEW_BYTES;

  useEffect(() => {
    if (tooBig) return;
    let alive = true;
    loadText(root, entry.path)
      .then((t) => {
        if (!alive) return;
        setContent(t);
        onText(t);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [root, entry.path, tooBig, loadText, onText]);

  if (tooBig) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>This file is {formatSize(entry.size)}, too big to preview. Use Share.</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (content == null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const isMarkdown = /\.(md|markdown)$/i.test(entry.name);
  return (
    <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
      {isMarkdown ? (
        <Markdown content={content} />
      ) : (
        <Text style={styles.text} selectable testID="file-text">
          {content}
        </Text>
      )}
    </ScrollView>
  );
}

// A PDF, downloaded to the cache with the key in headers (never in a URL),
// then shown by iOS's own PDF view inside a web view: scroll and pinch to
// zoom. Only the local file may load; anything else is refused.
function PdfPane({
  root,
  entry,
  download,
}: {
  root: string;
  entry: FileEntry;
  download: FileActions['downloadToCache'];
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tooBig = entry.size != null && entry.size > MAX_PDF_PREVIEW_BYTES;

  useEffect(() => {
    if (tooBig) return;
    let alive = true;
    setUri(null);
    setError(null);
    download(root, entry)
      .then((file) => alive && setUri(file.uri))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [root, entry, download, tooBig, attempt]);

  if (tooBig) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>This PDF is {formatSize(entry.size)}, too big to preview. Use Share.</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable testID="pdf-retry" accessibilityRole="button" onPress={() => setAttempt((n) => n + 1)} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (uri == null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>Loading {entry.name}…</Text>
      </View>
    );
  }
  return (
    <WebView
      testID="file-pdf"
      source={{ uri }}
      originWhitelist={['file://*']}
      style={styles.pdf}
      onError={(e) => setError(e.nativeEvent.description || 'Couldn’t show this PDF. Use Share.')}
    />
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  busy,
  disabled,
  testID,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, disabled && !busy && styles.actionDisabled, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={icon} size={18} color={colors.accent} />}
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  stage: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  image: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: space.sm, backgroundColor: colors.bg },
  name: { color: colors.textPrimary, fontSize: font.body, fontFamily: mono, textAlign: 'center' },
  dim: { color: colors.textDim, fontSize: font.meta, textAlign: 'center' },
  error: { color: colors.error, fontSize: font.meta, textAlign: 'center' },
  textScroll: { flex: 1, backgroundColor: colors.bg },
  pdf: { flex: 1, backgroundColor: colors.bg },
  retry: {
    marginTop: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
  },
  retryText: { color: colors.accent, fontSize: font.meta, fontFamily: mono },
  textContent: { padding: space.lg },
  text: { color: colors.textBody, fontSize: font.body, fontFamily: mono, lineHeight: 20 },
  note: {
    color: colors.textBody,
    fontSize: font.small,
    fontFamily: mono,
    textAlign: 'center',
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
  },
  bar: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.bg,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
    backgroundColor: 'rgba(94,177,255,0.12)',
  },
  actionDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
  actionText: { color: colors.accent, fontSize: font.small, fontFamily: mono },
});
