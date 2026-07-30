import { cannedStatus, parseSpeechMarker, speechForReply, VOICE_MODE_SUFFIX } from '../speechReply';

const EDIT_REPLY = [
  'I updated the hook and its test.',
  '',
  '```ts',
  'export function useThing() {',
  '  return 42;',
  '}',
  '```',
  '',
  'Changed files: src/hooks/useThing.ts, src/hooks/__tests__/useThing.test.ts',
  '',
  'SPEECH: I fixed the hook and its test, both suites pass now.',
].join('\n');

it('extracts the speech line from a big file-edit reply', () => {
  expect(parseSpeechMarker(EDIT_REPLY)).toBe(
    'I fixed the hook and its test, both suites pass now.',
  );
});

it('uses the last marker when the reply mentions the literal earlier', () => {
  const reply = 'The marker looks like SPEECH: example.\n\nSPEECH: All done here.';
  expect(parseSpeechMarker(reply)).toBe('All done here.');
});

it('returns null when there is no marker', () => {
  expect(parseSpeechMarker('Just a plain reply with code:\n```js\nx\n```')).toBeNull();
});

it('ignores a marker line with empty content', () => {
  expect(parseSpeechMarker('body\nSPEECH:   ')).toBeNull();
});

it('never speaks a marker buried inside a code fence', () => {
  const reply = ['```', 'SPEECH: this is sample code, not a summary', '```'].join('\n');
  expect(parseSpeechMarker(reply)).toBeNull();
});

it('canned status mentions tool activity when present', () => {
  expect(cannedStatus(0)).toBe('Done, the reply is on screen.');
  expect(cannedStatus(1)).toBe('Done, I used 1 tool, details on screen.');
  expect(cannedStatus(3)).toBe('Done, I used 3 tools, details on screen.');
});

it('speechForReply prefers the marker and falls back to canned', () => {
  expect(speechForReply(EDIT_REPLY, 2)).toBe(
    'I fixed the hook and its test, both suites pass now.',
  );
  expect(speechForReply('No marker here.', 2)).toBe('Done, I used 2 tools, details on screen.');
});

it('the suffix is a single constant block that names the marker', () => {
  expect(VOICE_MODE_SUFFIX).toContain('SPEECH:');
  // One paragraph, no risk of the suffix itself spanning markers.
  expect(VOICE_MODE_SUFFIX.trim().split('\n').length).toBe(1);
});
