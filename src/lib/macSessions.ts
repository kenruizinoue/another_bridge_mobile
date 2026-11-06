// Pure helpers for sessions started from the phone and "Open on Mac".
import type { OpenOnMacResult } from '../api/sessions';
import type { SessionCard } from '../api/types';

// What the phone says after an "Open on Mac" tap.
export function describeOpenOnMac(result: OpenOnMacResult): string {
  const where = result.app === 'iterm' ? 'a new iTerm tab' : 'a new Terminal window';
  if (result.status === 'opened') return `Opened in ${where} on your Mac.`;
  if (result.status === 'waiting') {
    return `A phone turn is still running in this session. It opens in ${where} on your Mac when that turn ends.`;
  }
  return 'This session is already open in a tab on your Mac.';
}

// The card for a session the phone just started, until the next list
// refresh brings the real one. The title is the name, else the start of
// the first message, so the chat header never shows an id.
export function newSessionCard(
  session: { session_id: string; cwd: string; name: string | null },
  message: string,
  now: number = Date.now(),
): SessionCard {
  const cwd = session.cwd || null;
  const firstLine = message.trim().split('\n')[0] ?? '';
  const title =
    session.name?.trim() ||
    (firstLine.length > 60 ? `${firstLine.slice(0, 60).trimEnd()}…` : firstLine) ||
    'New session';
  return {
    session_id: session.session_id,
    title,
    cwd,
    project: cwd ? cwd.replace(/\/+$/, '').split('/').pop() || cwd : 'new',
    message_count: 1,
    created_at: new Date(now).toISOString(),
    last_activity: now / 1000,
    size_bytes: 0,
    terminal: null,
  };
}
