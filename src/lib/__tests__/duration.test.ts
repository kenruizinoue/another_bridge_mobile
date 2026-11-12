import { formatDuration } from '../time';

it('formats running times', () => {
  expect(formatDuration(0)).toBe('0s');
  expect(formatDuration(45)).toBe('45s');
  expect(formatDuration(723)).toBe('12m 3s');
  expect(formatDuration(7500)).toBe('2h 5m');
  expect(formatDuration(3 * 86400 + 4 * 3600 + 5)).toBe('3d 4h');
  expect(formatDuration(-5)).toBe('0s');
});
