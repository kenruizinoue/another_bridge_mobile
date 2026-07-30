import { fireEvent, render, screen } from '@testing-library/react-native';
import ConversationPill from '../ConversationPill';

const noop = () => {};

function pill(overrides: Partial<Parameters<typeof ConversationPill>[0]> = {}) {
  return (
    <ConversationPill
      state="listening"
      transcript={null}
      onCancel={noop}
      onInterrupt={noop}
      onExit={noop}
      {...overrides}
    />
  );
}

it('renders nothing when idle', async () => {
  await render(pill({ state: 'idle' }));
  expect(screen.queryByTestId('conversation-pill')).toBeNull();
});

it('shows the loop state label', async () => {
  await render(pill({ state: 'listening' }));
  expect(screen.getByText('Listening…')).toBeTruthy();
});

it('confirming shows the transcript and cancel fires', async () => {
  const onCancel = jest.fn();
  await render(pill({ state: 'confirming', transcript: 'run the tests', onCancel }));
  expect(screen.getByTestId('conversation-transcript')).toHaveTextContent('run the tests');
  fireEvent.press(screen.getByTestId('conversation-cancel'));
  expect(onCancel).toHaveBeenCalled();
});

it('tapping the pill while listening does not interrupt', async () => {
  const onInterrupt = jest.fn();
  await render(pill({ state: 'listening', onInterrupt }));
  fireEvent.press(screen.getByTestId('conversation-pill'));
  expect(onInterrupt).not.toHaveBeenCalled();
});

it('tapping the pill while speaking interrupts', async () => {
  const onInterrupt = jest.fn();
  await render(pill({ state: 'speaking', onInterrupt }));
  fireEvent.press(screen.getByTestId('conversation-pill'));
  expect(onInterrupt).toHaveBeenCalled();
});

it('exit button fires onExit', async () => {
  const onExit = jest.fn();
  await render(pill({ state: 'waitingReply', onExit }));
  fireEvent.press(screen.getByTestId('conversation-exit'));
  expect(onExit).toHaveBeenCalled();
});
