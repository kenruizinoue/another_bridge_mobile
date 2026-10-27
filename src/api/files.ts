// Files endpoints (bridge ticket 19). The bridge owns which folders are
// shared; the app only knows root names and paths relative to them, so a
// new shared folder on the Mac shows up here with no app change.
import { apiGet, BRIDGE_URL, bridgeHeaders } from './client';

// Text previews stop here; bigger files open through the share sheet.
export const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

export type FileKind = 'dir' | 'video' | 'image' | 'audio' | 'pdf' | 'text' | 'other';

export type FileRoot = { name: string; label: string };

export type FileEntry = {
  name: string;
  path: string; // relative to its root
  kind: FileKind;
  size: number | null; // null for folders
  modified: number; // epoch seconds
  preview?: string | null; // a folder's cover image, relative to the root
};

export type FolderListing = {
  root: string;
  path: string;
  entries: FileEntry[];
  truncated: boolean;
};

export type LocatedPath = { root: string; path: string; kind: FileKind };

const q = encodeURIComponent;

export async function fetchRoots(): Promise<FileRoot[]> {
  return (await apiGet<{ roots: FileRoot[] }>('/files/roots')).roots;
}

export function listFolder(root: string, path = ''): Promise<FolderListing> {
  return apiGet<FolderListing>(`/files/list?root=${q(root)}&path=${q(path)}`);
}

// Map a path seen in a chat (absolute or ~/) to a shared root.
export function locatePath(path: string): Promise<LocatedPath> {
  return apiGet<LocatedPath>(`/files/locate?path=${q(path)}`);
}

export function fileUrl(root: string, path: string): string {
  return `${BRIDGE_URL}/files/raw?root=${q(root)}&path=${q(path)}`;
}

// A source for Image / VideoView: the URL plus the auth headers, so no key
// ever goes into a URL.
export function fileSource(root: string, path: string): { uri: string; headers: Record<string, string> } {
  return { uri: fileUrl(root, path), headers: bridgeHeaders() };
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// The text of a small text file, for the in-app preview.
export async function fetchText(root: string, path: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(fileUrl(root, path), { headers: bridgeHeaders() });
  } catch {
    throw new Error(`Can't reach the bridge at ${BRIDGE_URL}.`);
  }
  if (!res.ok) throw new Error(res.status === 403 ? 'That file is not shared.' : `Bridge returned ${res.status}.`);
  return res.text();
}
