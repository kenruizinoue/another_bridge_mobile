import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FilesScreen from '../FilesScreen';
import type { FilesGateway } from '../../hooks/useFileBrowser';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { useVideoPlayer: jest.fn(() => ({})), VideoView: (props: { testID?: string }) => <View testID={props.testID} /> };
});
jest.mock('../../lib/files/fileActions', () => ({
  saveToPhotos: jest.fn(),
  shareFile: jest.fn(),
  copyText: jest.fn(),
}));

const gateway = (): FilesGateway => ({
  fetchRoots: jest.fn(async () => [{ name: 'outputs', label: 'agent_outputs' }]),
  listFolder: jest.fn(async (_root: string, path = '') =>
    path === ''
      ? { root: 'outputs', path: '', truncated: false, entries: [{ name: 'gpt_reel', path: 'gpt_reel', kind: 'dir' as const, size: null, modified: 1000, preview: 'gpt_reel/gpt_cover.png' }] }
      : { root: 'outputs', path, truncated: false, entries: [{ name: 'gpt.mp4', path: 'gpt_reel/gpt.mp4', kind: 'video' as const, size: 5000, modified: 1000 }] },
  ),
  locatePath: jest.fn(),
});

it('lists the shared folder, opens a reel and plays it', async () => {
  await render(<FilesScreen onClose={jest.fn()} gateway={gateway()} />);
  expect(await screen.findByText('gpt_reel')).toBeOnTheScreen();
  expect(screen.getAllByText('agent_outputs')).toHaveLength(2); // title and breadcrumb

  await fireEvent.press(screen.getByTestId('file-row-gpt_reel'));
  expect(await screen.findByText('gpt.mp4')).toBeOnTheScreen();

  await fireEvent.press(screen.getByTestId('file-row-gpt_reel/gpt.mp4'));
  expect(await screen.findByTestId('file-video')).toBeOnTheScreen();
  expect(screen.getByTestId('file-save')).toBeOnTheScreen();
});

it('back walks up and finally closes; the X closes at once', async () => {
  const onClose = jest.fn();
  await render(<FilesScreen onClose={onClose} gateway={gateway()} />);
  await fireEvent.press(await screen.findByTestId('file-row-gpt_reel'));
  await screen.findByText('gpt.mp4');

  await fireEvent.press(screen.getByTestId('files-back'));
  expect(await screen.findByText('gpt_reel')).toBeOnTheScreen();
  expect(onClose).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByTestId('files-back'));
  expect(onClose).toHaveBeenCalledTimes(1);

  await fireEvent.press(screen.getByTestId('files-close'));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('shows a hint when the bridge shares no folders', async () => {
  const g = gateway();
  (g.fetchRoots as jest.Mock).mockResolvedValue([]);
  await render(<FilesScreen onClose={jest.fn()} gateway={g} />);
  expect(await screen.findByText('No shared folders yet.')).toBeOnTheScreen();
});

it('shows the error state with Retry', async () => {
  const g = gateway();
  (g.listFolder as jest.Mock).mockRejectedValueOnce(new Error('Bridge returned 500.'));
  await render(<FilesScreen onClose={jest.fn()} gateway={g} />);
  expect(await screen.findByText('Bridge returned 500.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('files-retry'));
  await waitFor(() => expect(screen.getByText('gpt_reel')).toBeOnTheScreen());
});

it('keeps the header below the status bar inside the Files modal', async () => {
  // A Modal's SafeAreaView gets no insets on iOS, so the screen pads itself
  // with the app's insets (Ken, 2026-10-24: the back button sat under the clock).
  const metrics = { frame: { x: 0, y: 0, width: 428, height: 926 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <FilesScreen onClose={jest.fn()} gateway={gateway()} />
    </SafeAreaProvider>,
  );
  expect(screen.getByTestId('files-screen')).toHaveStyle({ paddingTop: 47, paddingBottom: 34 });
});
