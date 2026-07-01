// The status strip picks one of several labels from combined state; these
// pin the priority order so a refactor can't silently swap messages.
import { render, screen } from '@testing-library/react-native';
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

it('syncing without a queue reads as reconnecting', async () => {
  await render(<ChatStatusBar {...base} syncing />);
  expect(screen.getByText('reconnecting — syncing from the Mac…')).toBeOnTheScreen();
});

it('syncing with a queue shows the queue count and the queued previews', async () => {
  await render(<ChatStatusBar {...base} syncing queued={['first', 'second']} />);
  expect(screen.getByText('syncing — 2 queued…')).toBeOnTheScreen();
  expect(screen.getByText('⋯ first')).toBeOnTheScreen();
  expect(screen.getByText('⋯ second')).toBeOnTheScreen();
});

it('shows the send error only when nothing is running', async () => {
  await render(<ChatStatusBar {...base} sendError="Bridge returned 500." />);
  expect(screen.getByText('✕ Bridge returned 500.')).toBeOnTheScreen();

  // while sending, the working bar wins over a stale error
  await render(<ChatStatusBar {...base} sending sendError="Bridge returned 500." />);
  expect(screen.queryByText('✕ Bridge returned 500.')).toBeNull();
});
