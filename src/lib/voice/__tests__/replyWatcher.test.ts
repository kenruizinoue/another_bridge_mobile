import { createReplyWatcher } from '../replyWatcher';

const input = (
  waiting: boolean,
  busy: boolean,
  text: string | null = null,
  toolCount = 0,
) => ({ waiting, busy, latestAssistantText: text, toolCount });

it('speaks the marker line once the turn goes busy and then settles', () => {
  const w = createReplyWatcher();
  expect(w.update(input(true, true))).toBeNull(); // armed while running
  expect(
    w.update(input(true, false, 'Full reply body\n\nSPEECH: Tests are green.', 2)),
  ).toBe('Tests are green.');
});

it('never speaks a stale assistant turn from before the send', () => {
  const w = createReplyWatcher();
  // waitingReply entered, but the send has not flipped busy yet: the
  // latest assistant text on screen is the PREVIOUS reply.
  expect(w.update(input(true, false, 'SPEECH: old reply'))).toBeNull();
});

it('falls back to the canned status when the marker is missing', () => {
  const w = createReplyWatcher();
  w.update(input(true, true));
  expect(w.update(input(true, false, 'Edited 3 files:\n```diff\n+x\n```', 3))).toBe(
    'Done, I used 3 tools, details on screen.',
  );
});

it('fires once per turn, then re-arms for the next one', () => {
  const w = createReplyWatcher();
  w.update(input(true, true));
  expect(w.update(input(true, false, 'SPEECH: first'))).toBe('first');
  expect(w.update(input(true, false, 'SPEECH: first'))).toBeNull(); // no repeat
  w.update(input(false, false)); // spoke, machine moved on
  w.update(input(true, true)); // next turn
  expect(w.update(input(true, false, 'SPEECH: second'))).toBe('second');
});

it('disarms when conversation mode leaves waitingReply', () => {
  const w = createReplyWatcher();
  w.update(input(true, true));
  w.update(input(false, false));
  expect(w.update(input(true, false, 'SPEECH: should not fire'))).toBeNull();
});

it('waits for an assistant text before speaking', () => {
  const w = createReplyWatcher();
  w.update(input(true, true));
  expect(w.update(input(true, false, null, 1))).toBeNull();
  expect(w.update(input(true, false, 'SPEECH: now it landed'))).toBe('now it landed');
});

it('the schema speech field wins over marker parsing', () => {
  const w = createReplyWatcher();
  w.update(input(true, true));
  expect(
    w.update({
      waiting: true,
      busy: false,
      latestAssistantText: 'Body\nSPEECH: marker version',
      toolCount: 0,
      schemaSpeech: 'schema version',
    }),
  ).toBe('schema version');
});

it('schema speech fires even before the transcript re-sync lands', () => {
  const w = createReplyWatcher();
  w.update(input(true, true));
  expect(
    w.update({ waiting: true, busy: false, latestAssistantText: null, toolCount: 0, schemaSpeech: 'ready' }),
  ).toBe('ready');
});
