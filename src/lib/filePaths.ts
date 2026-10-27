// Finds file paths in Claude's replies so the chat can make them tappable
// (they open in the Files view when the bridge shares that folder). Pure,
// so it is easy to test.

const VIEWABLE = [
  'mp4', 'mov', 'm4v', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic',
  'mp3', 'm4a', 'wav', 'pdf', 'txt', 'md', 'json', 'csv', 'srt', 'pptx', 'docx', 'xlsx',
];

// An absolute or ~/ path with no spaces, ending in a viewable extension.
const PATH_RE = new RegExp(
  String.raw`(?:~|/Users/[^\s/]+)(?:/[^\s/\`'"()<>\[\]]+)*/[^\s/\`'"()<>\[\]]+\.(?:${VIEWABLE.join('|')})(?!\w|\.\w)`,
  'gi',
);

export type PathPart = { type: 'text'; value: string } | { type: 'path'; value: string };

export function splitPaths(text: string): PathPart[] {
  const parts: PathPart[] = [];
  let last = 0;
  for (const m of text.matchAll(PATH_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ type: 'text', value: text.slice(last, idx) });
    parts.push({ type: 'path', value: m[0] });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts.length ? parts : [{ type: 'text', value: text }];
}
