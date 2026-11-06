import { describeOpenOnMac, newSessionCard } from '../macSessions';

describe('describeOpenOnMac', () => {
  it('names the app that opened', () => {
    expect(describeOpenOnMac({ ok: true, status: 'opened', app: 'iterm' })).toBe(
      'Opened in a new iTerm tab on your Mac.',
    );
    expect(describeOpenOnMac({ ok: true, status: 'opened', app: 'terminal' })).toBe(
      'Opened in a new Terminal window on your Mac.',
    );
  });

  it('says a waiting tap opens when the phone turn ends', () => {
    const text = describeOpenOnMac({ ok: true, status: 'waiting', app: 'iterm' });
    expect(text).toMatch(/still running/);
    expect(text).toMatch(/when that turn ends/);
  });

  it('says when the session is already open', () => {
    expect(describeOpenOnMac({ ok: true, status: 'already_open', app: 'iterm' })).toMatch(/already open/);
  });
});

describe('newSessionCard', () => {
  const session = { session_id: 'abc', cwd: '/Users/ken', name: null };

  it('uses the name as the title', () => {
    expect(newSessionCard({ ...session, name: 'Nov/5 Errands' }, 'hello').title).toBe('Nov/5 Errands');
  });

  it('falls back to the first line of the message, cut at 60 characters', () => {
    expect(newSessionCard(session, 'fix the login bug\nmore detail').title).toBe('fix the login bug');
    const long = 'a'.repeat(80);
    expect(newSessionCard(session, long).title).toBe(`${'a'.repeat(60)}…`);
  });

  it('falls back to "New session" for an attachment-only start', () => {
    expect(newSessionCard(session, '  ').title).toBe('New session');
  });

  it('labels the project with the folder name', () => {
    const card = newSessionCard(session, 'hi', 1_800_000_000_000);
    expect(card.project).toBe('ken');
    expect(card.cwd).toBe('/Users/ken');
    expect(card.last_activity).toBe(1_800_000_000);
    expect(card.session_id).toBe('abc');
  });
});
