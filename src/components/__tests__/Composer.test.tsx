import { fireEvent, render, screen } from '@testing-library/react-native';
import Composer from '../Composer';
import type { Attachment, FileAttachment } from '../../hooks/useAttachments';

const baseProps = {
  draft: '',
  onChangeDraft: jest.fn(),
  attachments: [] as Attachment[],
  files: [] as FileAttachment[],
  onPickImages: jest.fn(),
  onPickFiles: jest.fn(),
  onRemoveAttachment: jest.fn(),
  onRemoveFile: jest.fn(),
  canAttachImages: true,
  canAttachFiles: true,
  busy: false,
  voiceStatus: 'idle' as const,
  onMicPress: jest.fn(),
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
  await render(<Composer {...baseProps} canAttachImages={false} canAttachFiles={false} />);
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

// ── The + attach menu and file chips ──────────────────────────────────

it('the + button opens the attach sheet: photos or files', async () => {
  const { ActionSheetIOS } = require('react-native');
  const sheetSpy = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(((...args: unknown[]) => (args[1] as (i: number) => void)(1))); // choose "Files"

  await render(<Composer {...baseProps} />);
  await fireEvent.press(screen.getByTestId('composer-attach'));

  expect(sheetSpy).toHaveBeenCalledWith(
    expect.objectContaining({ options: ['Photo Library', 'Files', 'Cancel'] }),
    expect.any(Function),
  );
  expect(baseProps.onPickFiles).toHaveBeenCalledTimes(1);
  expect(baseProps.onPickImages).not.toHaveBeenCalled();

  sheetSpy.mockImplementation(((...args: unknown[]) => (args[1] as (i: number) => void)(0))); // "Photo Library"
  await fireEvent.press(screen.getByTestId('composer-attach'));
  expect(baseProps.onPickImages).toHaveBeenCalledTimes(1);
  sheetSpy.mockRestore();
});

it('renders file chips with name and size, removable per chip', async () => {
  const files = [{ uri: 'r.pdf', name: 'report.pdf', size: 2 * 1024 * 1024, base64: 'x' }];
  await render(<Composer {...baseProps} files={files} />);

  expect(screen.getByText('report.pdf')).toBeOnTheScreen();
  expect(screen.getByText('2.0MB')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('file-remove-r.pdf'));
  expect(baseProps.onRemoveFile).toHaveBeenCalledWith('r.pdf');
});

it('a file alone enables send', async () => {
  const files = [{ uri: 'r.pdf', name: 'report.pdf', size: 10, base64: 'x' }];
  await render(<Composer {...baseProps} files={files} />);
  await fireEvent.press(screen.getByTestId('composer-send'));
  expect(baseProps.onSend).toHaveBeenCalledTimes(1);
});

// ── The mic (dictation) button ─────────────────────────────────────────

it('the mic button reports presses to the screen', async () => {
  await render(<Composer {...baseProps} />);
  await fireEvent.press(screen.getByTestId('composer-mic'));
  expect(baseProps.onMicPress).toHaveBeenCalledTimes(1);
  expect(baseProps.onSend).not.toHaveBeenCalled();
});

it('recording swaps the placeholder and keeps the mic pressable (stop)', async () => {
  await render(<Composer {...baseProps} voiceStatus="recording" />);
  expect(screen.getByPlaceholderText('Recording… tap stop to transcribe')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('composer-mic'));
  expect(baseProps.onMicPress).toHaveBeenCalledTimes(1);
});

it('transcribing shows a busy mic that ignores presses', async () => {
  await render(<Composer {...baseProps} voiceStatus="transcribing" />);
  expect(screen.getByPlaceholderText('Transcribing…')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('composer-mic'));
  expect(baseProps.onMicPress).not.toHaveBeenCalled();
});

it('shows the conversation button only when the screen wires it', async () => {
  await render(<Composer {...baseProps} />);
  expect(screen.queryByTestId('composer-conversation')).toBeNull();

  const onConversationPress = jest.fn();
  await render(<Composer {...baseProps} onConversationPress={onConversationPress} />);
  await fireEvent.press(screen.getByTestId('composer-conversation'));
  expect(onConversationPress).toHaveBeenCalled();
});


describe('while Claude works (1.9.0)', () => {
  const base = () => ({
    draft: 'also skip android',
    onChangeDraft: jest.fn(),
    attachments: [],
    files: [],
    onPickImages: jest.fn(),
    onPickFiles: jest.fn(),
    onRemoveAttachment: jest.fn(),
    onRemoveFile: jest.fn(),
    canAttachImages: true,
    canAttachFiles: true,
    busy: true,
    voiceStatus: 'idle' as const,
    onMicPress: jest.fn(),
    onSend: jest.fn(),
    onModeChange: jest.fn(),
    running: true,
    onStop: jest.fn(),
  });

  it('shows the Now / After switch only with something typed', async () => {
    const props = base();
    const view = await render(<Composer {...props} mode="now" />);
    expect(screen.getByTestId('composer-mode')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Add to what Claude is doing…')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('composer-mode-after'));
    expect(props.onModeChange).toHaveBeenCalledWith('after');
    await view.rerender(<Composer {...props} draft="" mode="now" />);
    expect(screen.queryByTestId('composer-mode')).toBeNull();
  });

  it('the after mode queues with a clock icon', async () => {
    await render(<Composer {...base()} mode="after" />);
    expect(screen.getByPlaceholderText('Queue for after this turn…')).toBeOnTheScreen();
    expect(screen.getByLabelText('Queue for after this turn')).toBeOnTheScreen();
  });

  it('greys out Now with the reason when the turn cannot take it', async () => {
    await render(<Composer {...base()} mode="now" nowAvailable={false} nowReason="Working in a Mac tab, so it waits in the queue." />);
    expect(screen.getByTestId('composer-mode-now')).toBeDisabled();
    expect(screen.getByTestId('composer-mode-reason')).toHaveTextContent(/Mac tab/);
    expect(screen.getByPlaceholderText('Queue for after this turn…')).toBeOnTheScreen();
  });

  it('shows Stop instead of send while the input is empty', async () => {
    const props = base();
    await render(<Composer {...props} draft="" />);
    await fireEvent.press(screen.getByTestId('composer-stop'));
    expect(props.onStop).toHaveBeenCalled();
    expect(screen.queryByTestId('composer-send')).toBeNull();
  });
});
