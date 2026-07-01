import { relativeTime } from '../time';

const NOW_MS = 1_750_000_000_000;
const secondsAgo = (s: number) => (NOW_MS - s * 1000) / 1000;

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it.each([
  [30, 'just now'],
  [5 * 60, '5m ago'],
  [3 * 3600, '3h ago'],
  [2 * 86400, '2d ago'],
  [45 * 86400, '1mo ago'],
  [400 * 86400, '1y ago'],
])('%d seconds ago renders "%s"', (ago, expected) => {
  expect(relativeTime(secondsAgo(ago))).toBe(expected);
});
