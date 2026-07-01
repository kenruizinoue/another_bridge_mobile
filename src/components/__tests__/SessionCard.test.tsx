import { fireEvent, render, screen } from '@testing-library/react-native';
import SessionCard from '../SessionCard';
import type { SessionCard as Card } from '../../api/types';

const NOW_MS = 1_750_000_000_000;

const card = (over: Partial<Card> = {}): Card => ({
  session_id: 's1',
  title: 'Fix the composer',
  cwd: '/Users/ken/repo',
  project: 'repo',
  message_count: 12,
  created_at: null,
  last_activity: NOW_MS / 1000 - 5 * 60, // 5 minutes ago
  size_bytes: 1,
  ...over,
});

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW_MS));
afterEach(() => jest.restoreAllMocks());

it('shows title, project, count, relative time, and cwd', async () => {
  await render(<SessionCard card={card()} onPress={jest.fn()} />);
  expect(screen.getByText('Fix the composer')).toBeOnTheScreen();
  expect(screen.getByText('repo')).toBeOnTheScreen();
  expect(screen.getByText('12 msgs')).toBeOnTheScreen();
  expect(screen.getByText('5m ago')).toBeOnTheScreen();
  expect(screen.getByText('/Users/ken/repo')).toBeOnTheScreen();
});

it('omits the cwd line when cwd is null', async () => {
  await render(<SessionCard card={card({ cwd: null })} onPress={jest.fn()} />);
  expect(screen.queryByText(/\/Users/)).toBeNull();
});

it('fires onPress with the full card', async () => {
  const onPress = jest.fn();
  const c = card();
  await render(<SessionCard card={c} onPress={onPress} />);
  await fireEvent.press(screen.getByTestId('session-card-s1'));
  expect(onPress).toHaveBeenCalledWith(c);
});
