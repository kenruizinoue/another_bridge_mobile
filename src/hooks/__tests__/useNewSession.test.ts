import { act, renderHook } from '@testing-library/react-native';
import useNewSession from '../useNewSession';
import { newSessionStream } from '../../api/sessions';

jest.mock('../../api/sessions', () => ({ newSessionStream: jest.fn() }));
const streamMock = newSessionStream as jest.MockedFunction<typeof newSessionStream>;

beforeEach(() => streamMock.mockReset());

function handlers() {
  const [, , h] = streamMock.mock.calls[streamMock.mock.calls.length - 1];
  return h;
}

it('hands a card to onCreated and closes the stream once the session exists', async () => {
  const stop = jest.fn();
  streamMock.mockReturnValue(stop);
  const onCreated = jest.fn();
  const { result } = await renderHook(() => useNewSession(onCreated));
  await act(async () => result.current.start('fix the bug', ' Nov/5 '));
  expect(streamMock).toHaveBeenCalledWith('fix the bug', 'Nov/5', expect.any(Object), [], []);
  expect(result.current.starting).toBe(true);
  await act(async () => handlers().onSession({ session_id: 'abc', cwd: '/Users/ken', name: 'Nov/5' }));
  expect(stop).toHaveBeenCalled();
  expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'abc', title: 'Nov/5' }));
  expect(result.current.starting).toBe(false);
});

it('shows the error and restores the form when the start fails', async () => {
  streamMock.mockReturnValue(jest.fn());
  const restore = jest.fn();
  const { result } = await renderHook(() => useNewSession(jest.fn()));
  await act(async () => result.current.start('hi', '', [], [], restore));
  await act(async () => handlers().onError('3 phone turns are already running'));
  expect(result.current.error).toBe('3 phone turns are already running');
  expect(result.current.starting).toBe(false);
  expect(restore).toHaveBeenCalled();
});

it('ignores a second start while one is starting', async () => {
  streamMock.mockReturnValue(jest.fn());
  const { result } = await renderHook(() => useNewSession(jest.fn()));
  await act(async () => result.current.start('one', ''));
  await act(async () => result.current.start('two', ''));
  expect(streamMock).toHaveBeenCalledTimes(1);
});

it('can start again after an error that came back at once', async () => {
  streamMock.mockImplementationOnce((_m, _n, h) => {
    h.onError('Set EXPO_PUBLIC_CODER_KEY');
    return jest.fn();
  });
  streamMock.mockReturnValue(jest.fn());
  const { result } = await renderHook(() => useNewSession(jest.fn()));
  await act(async () => result.current.start('one', ''));
  expect(result.current.error).toBe('Set EXPO_PUBLIC_CODER_KEY');
  await act(async () => result.current.start('two', ''));
  expect(streamMock).toHaveBeenCalledTimes(2);
});

it('closes the stream when the screen goes away', async () => {
  const stop = jest.fn();
  streamMock.mockReturnValue(stop);
  const { result, unmount } = await renderHook(() => useNewSession(jest.fn()));
  await act(async () => result.current.start('hi', ''));
  await unmount();
  expect(stop).toHaveBeenCalled();
});
