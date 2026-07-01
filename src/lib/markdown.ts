// Pure Markdown → AST for the chat renderer. Deliberately a small subset
// (headings, bold, italic, inline code, fenced code, bullet / ordered
// lists) — enough for Claude's output — with ZERO dependencies so the
// rendering can stay monospace and terminal-styled. Rendering lives in
// components/Markdown.tsx; this file has no React import on purpose, so
// the parsing is trivially unit-testable.

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string };

export type Block =
  | { type: 'heading'; level: number; inlines: InlineToken[] }
  | { type: 'paragraph'; inlines: InlineToken[] }
  | { type: 'bullet'; inlines: InlineToken[] }
  | { type: 'ordered'; marker: string; inlines: InlineToken[] }
  | { type: 'code'; lang: string | null; content: string };

// Ordered so code spans win over emphasis and ** wins over *.
const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

const isFence = (l: string) => /^\s*```/.test(l);
const isHeading = (l: string) => /^#{1,6}\s+/.test(l);
const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
const isOrdered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isSpecial = (l: string) =>
  isFence(l) || isHeading(l) || isBullet(l) || isOrdered(l);

export function parseInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ type: 'text', value: line.slice(last, idx) });
    const t = m[0];
    if (t.startsWith('`')) tokens.push({ type: 'code', value: t.slice(1, -1) });
    else if (t.startsWith('**')) tokens.push({ type: 'bold', value: t.slice(2, -2) });
    else tokens.push({ type: 'italic', value: t.slice(1, -1) });
    last = idx + t.length;
  }
  if (last < line.length) tokens.push({ type: 'text', value: line.slice(last) });
  return tokens.length ? tokens : [{ type: 'text', value: line }];
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = (src ?? '').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || null;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence
      blocks.push({ type: 'code', lang, content: buf.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, inlines: parseInline(heading[2]) });
      i++;
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: 'bullet', inlines: parseInline(bullet[1]) });
      i++;
      continue;
    }

    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      blocks.push({ type: 'ordered', marker: `${ordered[1]}.`, inlines: parseInline(ordered[2]) });
      i++;
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: fold consecutive plain lines into one (soft wrap).
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !isSpecial(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', inlines: parseInline(para.join(' ')) });
  }

  return blocks;
}
