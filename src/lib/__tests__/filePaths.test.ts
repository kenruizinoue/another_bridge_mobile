import { splitPaths } from '../filePaths';

it('finds an absolute path to a video', () => {
  const parts = splitPaths('Saved to /Users/ken/agent_outputs/posts/gpt_reel/gpt.mp4 just now.');
  expect(parts).toEqual([
    { type: 'text', value: 'Saved to ' },
    { type: 'path', value: '/Users/ken/agent_outputs/posts/gpt_reel/gpt.mp4' },
    { type: 'text', value: ' just now.' },
  ]);
});

it('finds ~/ paths and several in one line', () => {
  const parts = splitPaths('Cover ~/agent_outputs/a/cover.png and caption ~/agent_outputs/a/post.txt');
  expect(parts.filter((p) => p.type === 'path').map((p) => p.value)).toEqual([
    '~/agent_outputs/a/cover.png',
    '~/agent_outputs/a/post.txt',
  ]);
});

it('stops before trailing punctuation', () => {
  const parts = splitPaths('See ~/agent_outputs/report.pdf, then reply.');
  expect(parts[1]).toEqual({ type: 'path', value: '~/agent_outputs/report.pdf' });
  expect(parts[2]).toEqual({ type: 'text', value: ', then reply.' });
});

it('leaves code files, relative paths and plain text alone', () => {
  for (const text of ['src/App.tsx', '/Users/ken/project/main.py', 'no paths here', 'video.mp4']) {
    expect(splitPaths(text)).toEqual([{ type: 'text', value: text }]);
  }
});

it('handles an empty string', () => {
  expect(splitPaths('')).toEqual([{ type: 'text', value: '' }]);
});
