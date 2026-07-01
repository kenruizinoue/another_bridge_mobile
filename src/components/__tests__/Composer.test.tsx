import { fireEvent, render, screen } from '@testing-library/react-native';
import Composer from '../Composer';
import type { Attachment } from '../../hooks/useAttachments';

const baseProps = {
  draft: '',
  onChangeDraft: jest.fn(),
  attachments: [] as Attachment[],
  onPickImages: jest.fn(),
  onRemoveAttachment: jest.fn(),
  canAttach: true,
  busy: false,
  onSend: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

it('blocks send when there is no text and no attachments', async () => {
  await render(<Composer {...baseProps} />);
  await fireEvent.press(screen.getByTestId('composer-send'));
  expect(baseProps.onSend).not.toHaveBeenCalled();
});

it('whitespace-only text still counts as empty', async () => {
  await render(<Composer {...baseProps} draft="   " />);
  await fireEvent.press(screen.getByTestId('composer-send'));
  expect(baseProps.onSend).not.toHaveBeenCalled();
});

it('sends with text, and with attachments alone', async () => {
  await render(<Composer {...baseProps} draft="hi" />);
  await fireEvent.press(screen.getByTestId('composer-send'));
  expect(baseProps.onSend).toHaveBeenCalledTimes(1);

  const withImage = [{ uri: 'a.jpg', base64: 'x' }];
  await render(<Composer {...baseProps} attachments={withImage} />);
  await fireEvent.press(screen.getByTestId('composer-send'));
  expect(baseProps.onSend).toHaveBeenCalledTimes(2);
});

it('switches the placeholder to queueing while busy', async () => {
  await render(<Composer {...baseProps} busy />);
  expect(screen.getByPlaceholderText('Queue a message…')).toBeOnTheScreen();
});

it('blocks the attach button when the image cap is reached', async () => {
  await render(<Composer {...baseProps} canAttach={false} />);
  await fireEvent.press(screen.getByTestId('composer-attach'));
  expect(baseProps.onPickImages).not.toHaveBeenCalled();
});

it('renders a thumbnail strip and removes the tapped image', async () => {
  const attachments = [
    { uri: 'a.jpg', base64: 'x' },
    { uri: 'b.jpg', base64: 'y' },
  ];
  await render(<Composer {...baseProps} attachments={attachments} />);

  await fireEvent.press(screen.getByTestId('thumb-remove-a.jpg'));
  expect(baseProps.onRemoveAttachment).toHaveBeenCalledWith('a.jpg');
  expect(screen.getByTestId('thumb-remove-b.jpg')).toBeOnTheScreen();
});
