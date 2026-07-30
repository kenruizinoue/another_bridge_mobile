import { createStreamReader, extractSpeakableSentences } from '../streamReader';

it('extracts only complete sentences outside code fences', () => {
  const text = 'First sentence done. ```js\nconst x = 1. not spoken\n``` Second one done! And a trailing partial';
  expect(extractSpeakableSentences(text)).toEqual(['First sentence done.', 'Second one done!']);
});

it('excludes an in-progress unclosed fence and the SPEECH line', () => {
  const text = 'Intro sentence here. \nSPEECH: never read this aloud.\n```python\nstill streaming code';
  expect(extractSpeakableSentences(text)).toEqual(['Intro sentence here.']);
});

it('strips markdown noise from spoken sentences', () => {
  expect(extractSpeakableSentences('The **bold** `code` fix works.')).toEqual([
    'The bold code fix works.',
  ]);
});

function fakeSpeak() {
  const spoken: string[] = [];
  const speak = jest.fn(async (s: string) => {
    spoken.push(s);
    return 'done' as const;
  });
  return { speak, spoken };
}

it('queues new sentences incrementally and speaks them in order', async () => {
  const { speak, spoken } = fakeSpeak();
  const reader = createStreamReader(speak);
  reader.update('Hello there.');
  reader.update('Hello there. Second sen');
  reader.update('Hello there. Second sentence done. Third');
  await reader.drain();
  expect(spoken).toEqual(['Hello there.', 'Second sentence done.']);
  expect(reader.spoke()).toBe(true);
});

it('never re-speaks sentences already queued', async () => {
  const { speak } = fakeSpeak();
  const reader = createStreamReader(speak);
  reader.update('One done. Two done.');
  reader.update('One done. Two done.');
  await reader.drain();
  expect(speak).toHaveBeenCalledTimes(2);
});

it('cancel stops future sentences from being spoken', async () => {
  const { speak, spoken } = fakeSpeak();
  const reader = createStreamReader(speak);
  reader.update('First one done.');
  reader.cancel();
  reader.update('First one done. Second one done.');
  await reader.drain();
  expect(spoken).toEqual([]);
});

it('reset starts a clean turn', async () => {
  const { speak, spoken } = fakeSpeak();
  const reader = createStreamReader(speak);
  reader.update('Old turn sentence.');
  await reader.drain();
  reader.reset();
  reader.update('New turn sentence.');
  await reader.drain();
  expect(spoken).toEqual(['Old turn sentence.', 'New turn sentence.']);
});
