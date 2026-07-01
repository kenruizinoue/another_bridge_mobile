// The parser is unit-tested in lib/__tests__/markdown.test.ts; these pin
// the AST → RN mapping: markers, code verbatimness, and inline splitting.
import { render, screen } from '@testing-library/react-native';
import Markdown from '../Markdown';

it('renders headings, paragraphs, and both list markers', async () => {
  await render(<Markdown content={'# Title\n\nbody text\n\n- item one\n2) item two'} />);
  expect(screen.getByText('Title')).toBeOnTheScreen();
  expect(screen.getByText('body text')).toBeOnTheScreen();
  expect(screen.getByText('•')).toBeOnTheScreen();
  expect(screen.getByText('item one')).toBeOnTheScreen();
  expect(screen.getByText('2.')).toBeOnTheScreen();
  expect(screen.getByText('item two')).toBeOnTheScreen();
});

it('keeps fenced code verbatim, markdown markers included', async () => {
  await render(<Markdown content={'```py\nx = "**not bold**"\n- not a list\n```'} />);
  expect(screen.getByText('x = "**not bold**"\n- not a list')).toBeOnTheScreen();
});

it('splits inline tokens out of the surrounding text', async () => {
  await render(<Markdown content={'use `npm test` to *verify* the **suite**'} />);
  expect(screen.getByText('npm test')).toBeOnTheScreen();
  expect(screen.getByText('verify')).toBeOnTheScreen();
  expect(screen.getByText('suite')).toBeOnTheScreen();
  // the raw marked-up string never renders
  expect(screen.queryByText(/\*\*suite\*\*/)).toBeNull();
});

it('renders empty content as nothing', async () => {
  await render(<Markdown content="" />);
  const root = screen.toJSON() as { type: string; children: unknown[] | null };
  expect(root.type).toBe('View');
  expect(root.children ?? []).toHaveLength(0);
});

it('renders every heading level with a distinct size', async () => {
  await render(<Markdown content={'# One\n## Two\n### Three'} />);
  expect(screen.getByText('One')).toBeOnTheScreen();
  expect(screen.getByText('Two')).toBeOnTheScreen();
  expect(screen.getByText('Three')).toBeOnTheScreen();
  // h1 > h2 > h3 sizes from the theme all appear in the tree
  const json = JSON.stringify(screen.toJSON());
  for (const px of [20, 17, 15]) expect(json).toContain(`"fontSize":${px}`);
});
