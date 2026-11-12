import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActionSheetIOS, Alert } from 'react-native';
import ProcessesScreen from '../ProcessesScreen';
import { fetchProcesses, stopProcess, type ProcessList } from '../../api/processes';

jest.mock('../../api/processes', () => ({ fetchProcesses: jest.fn(), stopProcess: jest.fn() }));
jest.mock('../../api/sessions', () => ({
  stopSession: jest.fn(),
  describeStop: jest.requireActual('../../api/sessions').describeStop,
}));
const { stopSession } = require('../../api/sessions');
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const fetchMock = fetchProcesses as jest.MockedFunction<typeof fetchProcesses>;
const stopMock = stopProcess as jest.MockedFunction<typeof stopProcess>;

const data: ProcessList = {
  commands: 1,
  claude: [
    {
      pid: 4698,
      session_id: 's1',
      title: 'Kodama Marketing',
      origin: 'phone',
      status: 'busy',
      elapsed: 2538,
      commands: [{ pid: 10297, command: 'shopify theme dev --store=kodama', elapsed: 1793, cpu: 4.4, processes: 2 }],
    },
    { pid: 7225, session_id: 's2', title: 'AnotherBridge', origin: 'mac_tab', status: 'idle', elapsed: 90, commands: [] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

it('shows the running commands per session and every Claude process', async () => {
  fetchMock.mockResolvedValue(data);
  await render(<ProcessesScreen onClose={jest.fn()} />);
  expect(await screen.findByText('shopify theme dev --store=kodama')).toBeOnTheScreen();
  expect(screen.getByTestId('processes-summary')).toHaveTextContent('1 command running in 1 session');
  expect(screen.getByText('29m 53s · 4.4% CPU · 2 processes')).toBeOnTheScreen();
  expect(screen.getByText('Claude processes (2)')).toBeOnTheScreen();
  expect(screen.getByText(/Mac tab · idle/)).toBeOnTheScreen();
});

it('says when nothing runs', async () => {
  fetchMock.mockResolvedValue({ commands: 0, claude: [data.claude[1]] });
  await render(<ProcessesScreen onClose={jest.fn()} />);
  await waitFor(() =>
    expect(screen.getByTestId('processes-summary')).toHaveTextContent('Nothing running. 1 Claude session is open.'),
  );
});

it('stops a command only after confirming', async () => {
  fetchMock.mockResolvedValue(data);
  stopMock.mockResolvedValue({ ok: true });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    (buttons as any[]).find((b) => b.text === 'Stop')?.onPress?.();
  });
  await render(<ProcessesScreen onClose={jest.fn()} />);
  await fireEvent.press(await screen.findByTestId('command-stop-10297'));
  expect(alert).toHaveBeenCalledWith('Stop this command?', expect.stringContaining('shopify theme dev'), expect.any(Array));
  await waitFor(() => expect(stopMock).toHaveBeenCalledWith(10297));
  alert.mockRestore();
});

it('refreshes every 3 seconds while open', async () => {
  jest.useFakeTimers();
  fetchMock.mockResolvedValue(data);
  const view = await render(<ProcessesScreen onClose={jest.fn()} />);
  const before = fetchMock.mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  await view.unmount();
  jest.useRealTimers();
});


it('stops a whole session from its group, with or without its commands', async () => {
  fetchMock.mockResolvedValue(data);
  stopSession.mockResolvedValue({ turn: 'mac_tab', paused: false, commands_stopped: 1 });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((opts, cb) => {
    expect(opts.options).toEqual(["Stop Claude's turn", 'Stop the turn and all its commands', 'Cancel']);
    cb(1);
  });
  await render(<ProcessesScreen onClose={jest.fn()} />);
  await fireEvent.press(await screen.findByTestId('session-stop-4698'));
  await waitFor(() => expect(stopSession).toHaveBeenCalledWith('s1', true));
  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith('Kodama Marketing', 'Pressed Esc in its Mac tab, so Claude stops there. Ended 1 command.'),
  );
  sheet.mockRestore();
  alert.mockRestore();
});

it('shows a working session without commands so it can be stopped', async () => {
  fetchMock.mockResolvedValue({
    commands: 0,
    claude: [{ ...data.claude[1], status: 'busy' }],
  });
  await render(<ProcessesScreen onClose={jest.fn()} />);
  expect(await screen.findByText('Claude is working (no command running)')).toBeOnTheScreen();
  expect(screen.getByTestId('session-stop-7225')).toBeOnTheScreen();
});
