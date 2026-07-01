import { parseInline, parseMarkdown } from '../markdown';

describe('parseInline', () => {
  it('returns a single text token for plain text', () => {
    expect(parseInline('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('tokenizes bold, italic, and inline code', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'bold', value: 'b' },
      { type: 'text', value: ' ' },
      { type: 'italic', value: 'c' },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'd' },
    ]);
  });

  it('lets code spans win over emphasis markers inside them', () => {
    expect(parseInline('`a * b`')).toEqual([{ type: 'code', value: 'a * b' }]);
  });

  it('keeps trailing text after the last token', () => {
    expect(parseInline('**x** end')).toEqual([
      { type: 'bold', value: 'x' },
      { type: 'text', value: ' end' },
    ]);
  });
});

describe('parseMarkdown', () => {
  it('parses headings with level', () => {
    expect(parseMarkdown('## Title')).toEqual([
      { type: 'heading', level: 2, inlines: [{ type: 'text', value: 'Title' }] },
    ]);
  });

  it('folds consecutive plain lines into one paragraph (soft wrap)', () => {
    const blocks = parseMarkdown('line one\nline two');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      inlines: [{ type: 'text', value: 'line one line two' }],
    });
  });

  it('splits paragraphs on blank lines', () => {
    expect(parseMarkdown('a\n\nb')).toHaveLength(2);
  });

  it('parses bullet and ordered list items', () => {
    expect(parseMarkdown('- first\n2) second')).toEqual([
      { type: 'bullet', inlines: [{ type: 'text', value: 'first' }] },
      { type: 'ordered', marker: '2.', inlines: [{ type: 'text', value: 'second' }] },
    ]);
  });

  it('captures fenced code blocks verbatim with language', () => {
    const blocks = parseMarkdown('```py\nx = 1\n**not bold**\n```');
    expect(blocks).toEqual([{ type: 'code', lang: 'py', content: 'x = 1\n**not bold**' }]);
  });

  it('handles an unterminated fence without hanging', () => {
    expect(parseMarkdown('```\nabc')).toEqual([{ type: 'code', lang: null, content: 'abc' }]);
  });

  it('returns no blocks for empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
