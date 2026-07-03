// Attachments for the composer, two kinds with different pipelines:
//   images → downscale + JPEG-compress to base64 (the model SEES these
//            inline, and 10 photos must stay a few MB over the tunnel)
//   files  → read verbatim as base64 (the bridge saves them on the Mac
//            and claude Reads the path, so no compression and no
//            prompt-size worry — just a hard per-file size cap)
import { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File as FSFile } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export const MAX_IMAGES = 10;
export const MAX_FILES = 5;
export const MAX_FILE_MB = 20;

// Mirrors the bridge's allowlist (routers/sessions.py) so a bad pick
// fails instantly on the phone instead of as a server 422.
const ALLOWED_FILE_EXTENSIONS = new Set([
  'pdf', 'txt', 'md', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml',
  'log', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java',
  'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'rb', 'go', 'rs', 'sh',
  'sql', 'toml', 'ini', 'cfg', 'conf',
]);

export type Attachment = { uri: string; base64: string };
export type FileAttachment = { uri: string; name: string; size: number; base64: string };

export default function useAttachments(onError: (message: string) => void) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [files, setFiles] = useState<FileAttachment[]>([]);

  const pick = useCallback(async () => {
    if (attachments.length >= MAX_IMAGES) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      onError('Photo access is off — enable it in Settings to attach images.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - attachments.length,
      quality: 1,
    });
    if (res.canceled) return;
    const processed = await Promise.all(
      res.assets.map(async (a) => {
        const m = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: 1024 } }], {
          compress: 0.6,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        });
        return { uri: m.uri, base64: m.base64 ?? '' };
      }),
    );
    setAttachments((prev) => [...prev, ...processed.filter((p) => p.base64)].slice(0, MAX_IMAGES));
  }, [attachments.length, onError]);

  const pickFiles = useCallback(async () => {
    if (files.length >= MAX_FILES) return;
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const picked: FileAttachment[] = [];
    for (const a of res.assets.slice(0, MAX_FILES - files.length)) {
      const ext = a.name.includes('.') ? a.name.split('.').pop()!.toLowerCase() : '';
      if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
        onError(`.${ext || '?'} files aren't supported — Claude can't read them.`);
        continue;
      }
      if ((a.size ?? 0) > MAX_FILE_MB * 1024 * 1024) {
        onError(`${a.name} is too big — max ${MAX_FILE_MB}MB per file.`);
        continue;
      }
      try {
        const base64 = await new FSFile(a.uri).base64();
        picked.push({ uri: a.uri, name: a.name, size: a.size ?? 0, base64 });
      } catch {
        onError(`Couldn't read ${a.name}.`);
      }
    }
    if (picked.length) setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
  }, [files.length, onError]);

  const remove = useCallback((uri: string) => {
    setAttachments((prev) => prev.filter((a) => a.uri !== uri));
  }, []);

  const removeFile = useCallback((uri: string) => {
    setFiles((prev) => prev.filter((f) => f.uri !== uri));
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
    setFiles([]);
  }, []);

  // Hand a previously-cleared set back (send failed; don't lose anything).
  const restore = useCallback((images: Attachment[], fileItems: FileAttachment[]) => {
    setAttachments(images);
    setFiles(fileItems);
  }, []);

  return { attachments, files, pick, pickFiles, remove, removeFile, clear, restore };
}
