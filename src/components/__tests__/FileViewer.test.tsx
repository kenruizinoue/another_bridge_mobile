import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { File } from 'expo-file-system';
import FileViewer from '../FileViewer';
import type { FileEntry } from '../../api/files';

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { useVideoPlayer: jest.fn(() => ({})), VideoView: (props: { testID?: string }) => <View testID={props.testID} /> };
});
jest.mock('../../lib/files/fileActions', () => ({
  saveToPhotos: jest.fn(),
  shareFile: jest.fn(),
  copyText: jest.fn(),
  downloadToCache: jest.fn(),
}));

const file = (name: string, kind: FileEntry['kind'], size = 100): FileEntry => ({
  name,
  path: `posts/${name}`,
  kind,
  size,
  modified: 1000,
});

const cached = (name: string) => ({ uri: `file:///cache/bridge_files/${name}` }) as unknown as File;

const fakeActions = () => ({
  saveToPhotos: jest.fn(async () => {}),
  shareFile: jest.fn(async () => {}),
  copyText: jest.fn(async () => {}),
  downloadToCache: jest.fn(async (_root: string, entry: FileEntry) => cached(entry.name)),
});

it('plays a video and saves it to Photos', async () => {
  const actions = fakeActions();
  await render(<FileViewer root="outputs" entry={file('gpt.mp4', 'video')} fileActions={actions} />);
  expect(screen.getByTestId('file-video')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('file-save'));
  await waitFor(() => expect(screen.getByText('Saved to Photos.')).toBeOnTheScreen());
  expect(actions.saveToPhotos).toHaveBeenCalledWith('outputs', expect.objectContaining({ name: 'gpt.mp4' }));
});

it('shows a text file and copies it, with no Save button', async () => {
  const actions = fakeActions();
  const loadText = jest.fn(async () => 'The T in ChatGPT.');
  await render(<FileViewer root="outputs" entry={file('post.txt', 'text')} fileActions={actions} loadText={loadText} />);
  expect(await screen.findByText('The T in ChatGPT.')).toBeOnTheScreen();
  expect(screen.queryByTestId('file-save')).toBeNull();
  await fireEvent.press(screen.getByTestId('file-copy'));
  await waitFor(() => expect(actions.copyText).toHaveBeenCalledWith('The T in ChatGPT.'));
  expect(await screen.findByText('Copied.')).toBeOnTheScreen();
});

it('does not download a text file that is too big to preview', async () => {
  const loadText = jest.fn();
  await render(
    <FileViewer root="outputs" entry={file('big.log', 'text', 5 * 1024 * 1024)} fileActions={fakeActions()} loadText={loadText} />,
  );
  expect(screen.getByText(/too big to preview/)).toBeOnTheScreen();
  expect(loadText).not.toHaveBeenCalled();
});

it('shows a PDF in place from its downloaded copy', async () => {
  const actions = fakeActions();
  await render(<FileViewer root="outputs" entry={file('report.pdf', 'pdf')} fileActions={actions} />);
  const pdf = await screen.findByTestId('file-pdf');
  expect(pdf.props.source).toEqual({ uri: 'file:///cache/bridge_files/report.pdf' });
  expect(actions.downloadToCache).toHaveBeenCalledWith('outputs', expect.objectContaining({ name: 'report.pdf' }));
  expect(screen.queryByTestId('file-save')).toBeNull(); // a PDF isn't a photo
});

it('a PDF that fails to download says why and can retry', async () => {
  const actions = fakeActions();
  actions.downloadToCache.mockRejectedValueOnce(new Error('Bridge returned 404.'));
  await render(<FileViewer root="outputs" entry={file('report.pdf', 'pdf')} fileActions={actions} />);
  expect(await screen.findByText('Bridge returned 404.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('pdf-retry'));
  expect(await screen.findByTestId('file-pdf')).toBeOnTheScreen();
  expect(actions.downloadToCache).toHaveBeenCalledTimes(2);
});

it('a PDF the web view cannot show offers Retry', async () => {
  const actions = fakeActions();
  await render(<FileViewer root="outputs" entry={file('report.pdf', 'pdf')} fileActions={actions} />);
  const pdf = await screen.findByTestId('file-pdf');
  await waitFor(() => pdf.props.onError({ nativeEvent: { description: '' } }));
  expect(await screen.findByText('Couldn’t show this PDF. Use Share.')).toBeOnTheScreen();
  expect(screen.getByTestId('pdf-retry')).toBeOnTheScreen();
});

it('does not download a PDF that is too big to preview', async () => {
  const actions = fakeActions();
  await render(<FileViewer root="outputs" entry={file('huge.pdf', 'pdf', 200 * 1024 * 1024)} fileActions={actions} />);
  expect(screen.getByText(/too big to preview/)).toBeOnTheScreen();
  expect(actions.downloadToCache).not.toHaveBeenCalled();
});

it('shares a PDF and shows an error when sharing fails', async () => {
  const actions = fakeActions();
  actions.shareFile.mockRejectedValueOnce(new Error('Sharing is not available on this device.'));
  await render(<FileViewer root="outputs" entry={file('report.pdf', 'pdf')} fileActions={actions} />);
  await screen.findByTestId('file-pdf');
  await fireEvent.press(screen.getByTestId('file-share'));
  expect(await screen.findByText('Sharing is not available on this device.')).toBeOnTheScreen();
});

it('other files still offer Share only', async () => {
  await render(<FileViewer root="outputs" entry={file('data.zip', 'other')} fileActions={fakeActions()} />);
  expect(screen.getByText('data.zip')).toBeOnTheScreen();
  expect(screen.getByText(/Open it with Share/)).toBeOnTheScreen();
});
