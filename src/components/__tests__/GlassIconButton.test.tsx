import { fireEvent, render, screen } from '@testing-library/react-native';
import GlassIconButton from '../GlassIconButton';

it('fires onPress when enabled', async () => {
  const onPress = jest.fn();
  await render(<GlassIconButton name="refresh" onPress={onPress} testID="btn" />);
  await fireEvent.press(screen.getByTestId('btn'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('blocks presses while disabled', async () => {
  const onPress = jest.fn();
  await render(<GlassIconButton name="refresh" onPress={onPress} disabled testID="btn" />);
  await fireEvent.press(screen.getByTestId('btn'));
  expect(onPress).not.toHaveBeenCalled();
});

it('swaps the icon for a spinner and blocks presses while busy', async () => {
  const onPress = jest.fn();
  await render(<GlassIconButton name="refresh" onPress={onPress} busy testID="btn" />);
  const json = JSON.stringify(screen.toJSON());
  expect(json).toContain('ActivityIndicator'); // spinner in place of the icon
  await fireEvent.press(screen.getByTestId('btn'));
  expect(onPress).not.toHaveBeenCalled();
});
