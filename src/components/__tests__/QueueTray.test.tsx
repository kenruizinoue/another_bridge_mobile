import { fireEvent, render, screen } from '@testing-library/react-native';
import QueueTray, { steerLabel } from '../QueueTray';

const items = [
  { id: 'a', preview: 'deploy when done', text: 'deploy when done' },
  { id: 'b', preview: 'then post the summary', text: 'then post the summary' },
];

async function setup(overrides: Partial<React.ComponentProps<typeof QueueTray>> = {}) {
  const props = {
    steers: [],
    items,
    paused: false,
    lastDeleted: null,
    notice: null,
    onSendNow: jest.fn(),
    onSendAllNow: jest.fn(),
    onDelete: jest.fn(),
    onEdit: jest.fn(),
    onUndo: jest.fn(),
    onRunQueue: jest.fn(),
    ...overrides,
  };
  const view = await render(<QueueTray {...props} />);
  return { props, view };
}

it('labels each state of a message sent into the turn', () => {
  expect(steerLabel({ id: '1', text: 'x', state: 'sending' })).toBe('sending…');
  expect(steerLabel({ id: '1', text: 'x', state: 'sent' })).toBe('sent into this turn');
  expect(steerLabel({ id: '1', text: 'x', state: 'read' })).toBe('Claude got it');
});

it('renders nothing when there is nothing to show', async () => {
  await setup({ items: [] });
  expect(screen.queryByTestId('queue-tray')).toBeNull();
});

it('gives each queued message Send now and Delete, and long-press edits', async () => {
  const { props } = await setup();
  expect(screen.getByText('Queued (2)')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('queue-send-now-a'));
  expect(props.onSendNow).toHaveBeenCalledWith('a');
  await fireEvent.press(screen.getByTestId('queue-delete-b'));
  expect(props.onDelete).toHaveBeenCalledWith('b');
  await fireEvent(screen.getByTestId('queue-edit-a'), 'longPress');
  expect(props.onEdit).toHaveBeenCalledWith(items[0]);
});

it('offers Send all now only for two or more', async () => {
  const { props, view } = await setup();
  await fireEvent.press(screen.getByTestId('queue-send-all'));
  expect(props.onSendAllNow).toHaveBeenCalled();
  await view.unmount();
  await setup({ items: [items[0]] });
  expect(screen.queryByTestId('queue-send-all')).toBeNull();
});

it('shows the paused bar after Stop with Run queue', async () => {
  const { props } = await setup({ paused: true });
  expect(screen.getByText(/2 queued messages wait for you/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('queue-run'));
  expect(props.onRunQueue).toHaveBeenCalled();
});

it('shows Undo after a delete', async () => {
  const { props } = await setup({ items: [], lastDeleted: items[0] });
  expect(screen.getByText('Deleted "deploy when done"')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('queue-undo'));
  expect(props.onUndo).toHaveBeenCalled();
});

it('shows messages sent into the turn with their status', async () => {
  await setup({ items: [], steers: [{ id: 's', text: 'also skip android', state: 'read' }] });
  expect(screen.getByText('also skip android')).toBeOnTheScreen();
  expect(screen.getByText('Claude got it')).toBeOnTheScreen();
});
