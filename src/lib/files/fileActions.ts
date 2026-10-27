// What the viewer can do with a file: download it to the cache, save it to
// Photos, open the share sheet, or copy text. Native modules are touched
// only here, so screens and tests stay simple.
import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { bridgeHeaders } from '../../api/client';
import { fileUrl, type FileEntry } from '../../api/files';

const CACHE_FOLDER = 'bridge_files';

// iOS share sheet types, so Quick Look and "Save to Files" pick the right app.
const UTI: Partial<Record<string, string>> = {
  mp4: 'public.mpeg-4',
  mov: 'com.apple.quicktime-movie',
  png: 'public.png',
  jpg: 'public.jpeg',
  jpeg: 'public.jpeg',
  pdf: 'com.adobe.pdf',
  txt: 'public.plain-text',
  md: 'public.plain-text',
};

function extension(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

// Downloads into the cache, replacing an older copy. The system may clear
// the cache folder at any time, which is fine for a one-off share or save.
export async function downloadToCache(root: string, entry: FileEntry): Promise<File> {
  const folder = new Directory(Paths.cache, CACHE_FOLDER);
  if (!folder.exists) folder.create({ intermediates: true });
  const target = new File(folder, entry.name);
  return File.downloadFileAsync(fileUrl(root, entry.path), target, {
    headers: bridgeHeaders(),
    idempotent: true,
  });
}

export async function saveToPhotos(root: string, entry: FileEntry): Promise<void> {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('Allow saving to Photos in Settings, then try again.');
  }
  const file = await downloadToCache(root, entry);
  try {
    await createAsset(file.uri);
  } finally {
    deleteQuietly(file);
  }
}

// Photos sometimes answers "operation interrupted" (PHPhotosErrorDomain
// 3301) while its service is busy, for example after an iOS update, even
// for a valid file. Try once more, then point to the share sheet, whose
// Save Video goes through the system instead.
const PHOTOS_INTERRUPTED = /PHPhotosErrorDomain error 3301/;
const RETRY_DELAY_MS = 1500;

async function createAsset(uri: string): Promise<void> {
  try {
    await Asset.create(uri);
    return;
  } catch (e) {
    if (!isInterrupted(e)) throw e;
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  try {
    await Asset.create(uri);
  } catch (e) {
    if (!isInterrupted(e)) throw e;
    throw new Error(
      'Photos couldn’t save this right now (iOS error 3301). Use Share, then Save Video, or restart the iPhone and try again.',
    );
  }
}

function isInterrupted(e: unknown): boolean {
  return PHOTOS_INTERRUPTED.test(e instanceof Error ? e.message : String(e));
}

export async function shareFile(root: string, entry: FileEntry): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const file = await downloadToCache(root, entry);
  await Sharing.shareAsync(file.uri, { UTI: UTI[extension(entry.name)] });
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

function deleteQuietly(file: File): void {
  try {
    file.delete();
  } catch {
    // already gone
  }
}
