import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
}));

const file = (name: string, kind: FileEntry['kind'], size = 100): FileEntry => ({
  name,
  path: `posts/${name}`,
  kind,
  size,
  modified: 1000,
});

const fakeActions = () => ({
  saveToPhotos: jest.fn(async () => {}),
  shareFile: jest.fn(async () => {}),
  copyText: jest.fn(async () => {}),
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

it('shares a PDF and shows an error when sharing fails', async () => {
  const actions = fakeActions();
  actions.shareFile.mockRejectedValueOnce(new Error('Sharing is not available on this device.'));
  await render(<FileViewer root="outputs" entry={file('report.pdf', 'pdf')} fileActions={actions} />);
  expect(screen.getByText('report.pdf')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('file-share'));
  expect(await screen.findByText('Sharing is not available on this device.')).toBeOnTheScreen();
});
