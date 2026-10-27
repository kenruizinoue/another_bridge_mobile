import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadDraft, saveDraft } from '../drafts';

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('saves, loads and clears a draft per session', async () => {
  await saveDraft('a', 'first');
  await saveDraft('b', 'second');
  expect(await loadDraft('a')).toBe('first');
  expect(await loadDraft('b')).toBe('second');

  await saveDraft('a', '   ');
  expect(await loadDraft('a')).toBe('');
  expect(await AsyncStorage.getItem('draft:a')).toBeNull();
});

it('falls back to an empty draft when storage fails', async () => {
  const spy = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
  expect(await loadDraft('a')).toBe('');
  spy.mockRestore();
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
  await expect(saveDraft('a', 'x')).resolves.toBeUndefined();
});
