// Wire types for the another_bridge session API. Mirror the bridge's
// dataclasses (services/session_index.py) exactly.

// Another live Claude Code copy of a session on the Mac, usually a
// terminal tab. `active` = it is working now (mid-turn, or its agents are
// still running), so the bridge holds phone messages instead of starting
// a second copy that would redo the same work.
export type TerminalInfo = {
  open: boolean;
  busy: boolean;
  active: boolean;
  agents: number; // its agents that are still working
};

export type SessionCard = {
  session_id: string;
  title: string;
  cwd: string | null;
  project: string;
  message_count: number;
  created_at: string | null;
  last_activity: number; // epoch seconds
  size_bytes: number;
  terminal?: TerminalInfo | null; // missing on bridges before 1.6.0
};

// Compact summary of one tool call — mirrors the terminal's
// "Update(.env.local)  +1 -1" line. `stat` is a diff delta or null.
export type ToolRef = {
  name: string;
  label: string;
  stat: string | null;
};

export type Turn = {
  index: number;
  uuid: string | null;
  role: 'user' | 'assistant' | 'tool';
  text: string | null;
  tool_calls: number;
  tools: ToolRef[];
  timestamp: string | null;
};

export type MessagesPage = {
  messages: Turn[]; // newest-first
  total: number;
  has_more: boolean;
  next_before: number | null;
};
