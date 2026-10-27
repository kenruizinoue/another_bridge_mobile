// State for the Files view: the shared roots, the folder being shown, and
// the file open in the viewer. Screens render it; the gateway is injected
// so tests can swap the network for fakes.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as filesApi from '../api/files';
import type { FileEntry, FileRoot, FolderListing } from '../api/files';
import { parentPath } from '../api/files';

export type FilesGateway = Pick<typeof filesApi, 'fetchRoots' | 'listFolder' | 'locatePath'>;

type Location = { root: string; path: string };

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export default function useFileBrowser({
  initialPath,
  gateway: gatewayProp = filesApi,
}: {
  initialPath?: string | null; // a path tapped in a chat
  gateway?: FilesGateway;
} = {}) {
  // The gateway is fixed for the life of the screen, so a caller passing a
  // new object each render cannot restart the loads.
  const gateway = useRef(gatewayProp).current;
  const [roots, setRoots] = useState<FileRoot[] | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [viewing, setViewing] = useState<FileEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // First load: the roots, then the tapped path or the only root.
  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const found = await gateway.fetchRoots();
      setRoots(found);
      if (initialPath) {
        const hit = await gateway.locatePath(initialPath);
        if (hit.kind === 'dir') {
          setLocation({ root: hit.root, path: hit.path });
        } else {
          setLocation({ root: hit.root, path: parentPath(hit.path) });
          setViewing({ name: basename(hit.path), path: hit.path, kind: hit.kind, size: null, modified: 0 });
        }
      } else if (found.length === 1) {
        setLocation({ root: found[0].name, path: '' });
      } else {
        setLoading(false);
      }
    } catch (e) {
      setError(initialPath && /not shared|not found/i.test(message(e)) ? 'That file is not in a shared folder.' : message(e));
      setLoading(false);
    }
  }, [gateway, initialPath]);

  useEffect(() => {
    start();
  }, [start]);

  const load = useCallback(
    async (loc: Location, isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setListing(await gateway.listFolder(loc.root, loc.path));
      } catch (e) {
        setError(message(e));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [gateway],
  );

  useEffect(() => {
    if (location) load(location);
    else setListing(null);
  }, [location, load]);

  const open = useCallback(
    (entry: FileEntry) => {
      if (!location) return;
      if (entry.kind === 'dir') setLocation({ root: location.root, path: entry.path });
      else setViewing(entry);
    },
    [location],
  );

  const openRoot = useCallback((root: string) => setLocation({ root, path: '' }), []);

  // One step back: viewer, then parent folder, then the roots list.
  // Returns false when there is nothing left, so the screen closes.
  const back = useCallback((): boolean => {
    if (viewing) {
      setViewing(null);
      return true;
    }
    if (location && location.path) {
      setLocation({ root: location.root, path: parentPath(location.path) });
      return true;
    }
    if (location && roots && roots.length > 1) {
      setLocation(null);
      return true;
    }
    return false;
  }, [viewing, location, roots]);

  const refresh = useCallback(() => {
    if (location) load(location, true);
  }, [location, load]);

  const retry = useCallback(() => {
    if (location) load(location);
    else start();
  }, [location, load, start]);

  const rootLabel = roots?.find((r) => r.name === location?.root)?.label ?? location?.root ?? '';

  return {
    roots,
    location,
    rootLabel,
    listing,
    viewing,
    loading,
    refreshing,
    error,
    open,
    openRoot,
    back,
    closeViewer: () => setViewing(null),
    refresh,
    retry,
  };
}
