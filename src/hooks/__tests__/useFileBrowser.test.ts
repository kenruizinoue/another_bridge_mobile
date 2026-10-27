import { act, renderHook, waitFor } from '@testing-library/react-native';
import useFileBrowser, { type FilesGateway } from '../useFileBrowser';
import type { FileEntry, FolderListing } from '../../api/files';

const entry = (path: string, kind: FileEntry['kind']): FileEntry => ({
  name: path.split('/').pop() ?? path,
  path,
  kind,
  size: kind === 'dir' ? null : 10,
  modified: 1000,
});

const listing = (path: string, entries: FileEntry[]): FolderListing => ({ root: 'outputs', path, entries, truncated: false });

function gateway(overrides: Partial<FilesGateway> = {}): FilesGateway {
  return {
    fetchRoots: jest.fn(async () => [{ name: 'outputs', label: 'agent_outputs' }]),
    listFolder: jest.fn(async (_root: string, path = '') =>
      path === ''
        ? listing('', [entry('posts', 'dir'), entry('report.pdf', 'pdf')])
        : listing(path, [entry(`${path}/gpt.mp4`, 'video')]),
    ),
    locatePath: jest.fn(async () => ({ root: 'outputs', path: 'posts/gpt.mp4', kind: 'video' as const })),
    ...overrides,
  };
}

it('opens the only root straight away', async () => {
  const g = gateway();
  const { result } = await renderHook(() => useFileBrowser({ gateway: g }));
  await waitFor(() => expect(result.current.listing?.entries).toHaveLength(2));
  expect(result.current.location).toEqual({ root: 'outputs', path: '' });
  expect(result.current.rootLabel).toBe('agent_outputs');
  expect(g.listFolder).toHaveBeenCalledWith('outputs', '');
});

it('shows the roots list when there are several', async () => {
  const g = gateway({
    fetchRoots: jest.fn(async () => [
      { name: 'outputs', label: 'agent_outputs' },
      { name: 'builds', label: 'builds' },
    ]),
  });
  const { result } = await renderHook(() => useFileBrowser({ gateway: g }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.location).toBeNull();
  expect(g.listFolder).not.toHaveBeenCalled();
  await act(async () => result.current.openRoot('builds'));
  await waitFor(() => expect(g.listFolder).toHaveBeenCalledWith('builds', ''));
  // Back from a root goes to the roots list, then closes.
  let handled = false;
  await act(async () => {
    handled = result.current.back();
  });
  expect(handled).toBe(true);
  expect(result.current.location).toBeNull();
  await act(async () => {
    handled = result.current.back();
  });
  expect(handled).toBe(false);
});

it('walks into a folder, opens a file, and steps back one level at a time', async () => {
  const { result } = await renderHook(() => useFileBrowser({ gateway: gateway() }));
  await waitFor(() => expect(result.current.listing?.entries).toHaveLength(2));

  await act(async () => result.current.open(entry('posts', 'dir')));
  await waitFor(() => expect(result.current.listing?.path).toBe('posts'));

  await act(async () => result.current.open(entry('posts/gpt.mp4', 'video')));
  expect(result.current.viewing?.name).toBe('gpt.mp4');

  let handled = false;
  await act(async () => {
    handled = result.current.back(); // closes the viewer
  });
  expect(handled).toBe(true);
  expect(result.current.viewing).toBeNull();

  await act(async () => {
    handled = result.current.back(); // up to the root
  });
  expect(result.current.location).toEqual({ root: 'outputs', path: '' });

  await act(async () => {
    handled = result.current.back(); // nothing left: the screen closes
  });
  expect(handled).toBe(false);
});

it('opens a path tapped in a chat in the viewer', async () => {
  const g = gateway();
  const { result } = await renderHook(() => useFileBrowser({ gateway: g, initialPath: '~/agent_outputs/posts/gpt.mp4' }));
  await waitFor(() => expect(result.current.viewing?.path).toBe('posts/gpt.mp4'));
  expect(g.locatePath).toHaveBeenCalledWith('~/agent_outputs/posts/gpt.mp4');
  expect(result.current.location).toEqual({ root: 'outputs', path: 'posts' });
});

it('explains a tapped path outside the shared folders', async () => {
  const g = gateway({ locatePath: jest.fn(async () => Promise.reject(new Error('that path is not shared'))) });
  const { result } = await renderHook(() => useFileBrowser({ gateway: g, initialPath: '~/secret.txt' }));
  await waitFor(() => expect(result.current.error).toBe('That file is not in a shared folder.'));
});

it('reports a listing error and retries', async () => {
  const listFolder = jest
    .fn()
    .mockRejectedValueOnce(new Error("Can't reach the bridge"))
    .mockResolvedValue(listing('', [entry('posts', 'dir')]));
  const { result } = await renderHook(() => useFileBrowser({ gateway: gateway({ listFolder }) }));
  await waitFor(() => expect(result.current.error).toBe("Can't reach the bridge"));
  await act(async () => result.current.retry());
  await waitFor(() => expect(result.current.listing?.entries).toHaveLength(1));
  expect(result.current.error).toBeNull();
});
