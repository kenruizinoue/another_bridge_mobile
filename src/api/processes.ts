// What runs on the Mac (bridge ticket 29): every live Claude process (a
// Mac tab, a phone turn) with the Bash commands running under it.
import { apiGet, apiPost } from './client';

export type RunningCommand = {
  pid: number;
  command: string; // secrets redacted by the bridge
  elapsed: number; // seconds
  cpu: number; // percent, with what it started
  processes: number; // the command and what it started
};

export type ClaudeProcess = {
  pid: number;
  session_id: string | null;
  title: string;
  origin: 'phone' | 'mac_tab' | 'headless';
  status: string; // busy | idle | ...
  elapsed: number;
  commands: RunningCommand[];
};

export type ProcessList = { claude: ClaudeProcess[]; commands: number };

export async function fetchProcesses(): Promise<ProcessList> {
  return apiGet<ProcessList>('/processes');
}

// Stop one command (and what it started). The pid goes twice as a check.
export async function stopProcess(pid: number): Promise<{ ok: boolean }> {
  return apiPost(`/processes/${pid}/stop`, { confirm: pid });
}
