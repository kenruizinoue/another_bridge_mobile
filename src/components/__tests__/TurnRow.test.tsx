import { render, screen } from '@testing-library/react-native';
import TurnRow from '../TurnRow';
import type { Turn } from '../../api/types';

const turn = (over: Partial<Turn>): Turn => ({
  index: 1,
  uuid: 'u1',
  role: 'user',
  text: null,
  tool_calls: 0,
  tools: [],
  timestamp: null,
  ...over,
});

it('shows user turns verbatim under the you marker', async () => {
  await render(<TurnRow turn={turn({ role: 'user', text: '**not markdown** literally' })} />);
  expect(screen.getByText('❯ you')).toBeOnTheScreen();
  // user text is NOT markdown-rendered — asterisks stay visible
  expect(screen.getByText('**not markdown** literally')).toBeOnTheScreen();
});

it('renders assistant turns as markdown', async () => {
  await render(<TurnRow turn={turn({ role: 'assistant', text: 'plain **bold** end' })} />);
  expect(screen.getByText('● claude')).toBeOnTheScreen();
  // the bold token is split out of the raw text by the renderer
  expect(screen.getByText('bold')).toBeOnTheScreen();
  expect(screen.queryByText('plain **bold** end')).toBeNull();
});

it('renders tool detail lines with their diff stat', async () => {
  await render(
    <TurnRow
      turn={turn({
        role: 'assistant',
        text: 'done',
        tools: [{ name: 'Update', label: 'Update(config.py)', stat: '+14 -2' }],
      })}
    />,
  );
  expect(screen.getByText(/⚙ Update\(config\.py\)/)).toBeOnTheScreen();
  expect(screen.getByText(/\+14 -2/)).toBeOnTheScreen();
});

it('falls back to a generic tool step marker for bare tool turns', async () => {
  await render(<TurnRow turn={turn({ role: 'tool', tools: [] })} />);
  expect(screen.getByText('⚙ tool step')).toBeOnTheScreen();
});
