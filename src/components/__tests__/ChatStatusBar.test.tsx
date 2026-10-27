// The status strip picks one of several labels from combined state; these
// pin the priority order so a refactor can't silently swap messages.
import { fireEvent, render, screen } from '@testing-library/react-native';
import ChatStatusBar from '../ChatStatusBar';

const base = { queued: [], sending: false, syncing: false, streaming: false, sendError: null };

it('renders nothing when idle', async () => {
  await render(<ChatStatusBar {...base} />);
  expect(screen.queryByText(/⋯|✕|…/)).toBeNull();
});

it('shows the plain working label while a turn runs without tokens yet', async () => {
  await render(<ChatStatusBar {...base} sending />);
  expect(screen.getByText('claude is working on the Mac…')).toBeOnTheScreen();
});

it('shows streaming… once tokens arrive', async () => {
  await render(<ChatStatusBar {...base} sending streaming />);
  expect(screen.getByText('streaming…')).toBeOnTheScreen();
});

it('a turn running on the Mac reads as working, never as reconnecting', async () => {
  await render(<ChatStatusBar {...base} syncing live />);
  expect(screen.getByText('claude is working on the Mac…')).toBeOnTheScreen();
  expect(screen.queryByText(/reconnecting/)).toBeNull();
});

it('reconnecting only shows when the bridge could not be reached', async () => {
  await render(<ChatStatusBar {...base} syncing live offline streaming />);
  expect(screen.getByText('reconnecting to the Mac…')).toBeOnTheScreen();
});

it('an attached turn that streams tokens reads as streaming', async () => {
  await render(<ChatStatusBar {...base} syncing live streaming />);
  expect(screen.getByText('streaming…')).toBeOnTheScreen();
});

it('a queue waiting to start shows its count and the queued previews', async () => {
  await render(<ChatStatusBar {...base} syncing queued={['first', 'second']} />);
  expect(screen.getByText('2 queued, waiting to start…')).toBeOnTheScreen();
  expect(screen.getByText('⋯ first')).toBeOnTheScreen();
  expect(screen.getByText('⋯ second')).toBeOnTheScreen();
});

it('a queue behind a running turn keeps the working label', async () => {
  await render(<ChatStatusBar {...base} syncing live queued={['next']} />);
  expect(screen.getByText('claude is working on the Mac…')).toBeOnTheScreen();
  expect(screen.getByText('⋯ next')).toBeOnTheScreen();
});

it('shows the send error only when nothing is running', async () => {
  await render(<ChatStatusBar {...base} sendError="Bridge returned 500." />);
  expect(screen.getByText('✕ Bridge returned 500.')).toBeOnTheScreen();

  // while sending, the working bar wins over a stale error
  await render(<ChatStatusBar {...base} sending sendError="Bridge returned 500." />);
  expect(screen.queryByText('✕ Bridge returned 500.')).toBeNull();
});

it('a queue held for a working terminal tab says so and offers Send anyway', async () => {
  const onSendAnyway = jest.fn();
  await render(
    <ChatStatusBar {...base} syncing queued={['still waiting?']} held="terminal" onSendAnyway={onSendAnyway} />,
  );
  expect(screen.getByText('1 queued until the Mac terminal is done…')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('send-anyway'));
  expect(onSendAnyway).toHaveBeenCalledTimes(1);
});

it('a queue held by the turn cap says other phone turns are running', async () => {
  await render(<ChatStatusBar {...base} syncing queued={['a', 'b']} held="limit" onSendAnyway={jest.fn()} />);
  expect(screen.getByText('2 queued, other phone turns are running…')).toBeOnTheScreen();
  expect(screen.getByTestId('send-anyway')).toBeOnTheScreen();
});

it('no Send anyway for a queue that just waits for the turn ahead', async () => {
  await render(<ChatStatusBar {...base} syncing queued={['next']} onSendAnyway={jest.fn()} />);
  expect(screen.queryByTestId('send-anyway')).toBeNull();
});

it('a working terminal tab shows with its running agents', async () => {
  const terminal = { open: true, busy: false, active: true, agents: 2 };
  await render(<ChatStatusBar {...base} terminal={terminal} />);
  expect(screen.getByText('working in the Mac terminal, 2 agents running')).toBeOnTheScreen();

  await render(<ChatStatusBar {...base} terminal={{ ...terminal, agents: 0, busy: true }} />);
  expect(screen.getByText('working in the Mac terminal')).toBeOnTheScreen();
});

it('a terminal tab that is open but quiet shows nothing', async () => {
  await render(<ChatStatusBar {...base} terminal={{ open: true, busy: false, active: false, agents: 0 }} />);
  expect(screen.queryByText(/terminal/)).toBeNull();
});
