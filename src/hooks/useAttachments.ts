// Image attachments for the composer: permission prompt, multi-select
// picking, and downscale + JPEG-compress so 10 photos are a few MB of
// base64 (not tens) — important over the tunnel.
import { useCallback, useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export const MAX_IMAGES = 10;

export type Attachment = { uri: string; base64: string };

export default function useAttachments(onDenied: (message: string) => void) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const pick = useCallback(async () => {
    if (attachments.length >= MAX_IMAGES) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      onDenied('Photo access is off — enable it in Settings to attach images.');
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
  }, [attachments.length, onDenied]);

  const remove = useCallback((uri: string) => {
    setAttachments((prev) => prev.filter((a) => a.uri !== uri));
  }, []);

  const clear = useCallback(() => setAttachments([]), []);

  // Hand a previously-cleared set back (send failed; don't lose the images).
  const restore = useCallback((items: Attachment[]) => setAttachments(items), []);

  return { attachments, pick, remove, clear, restore };
}
