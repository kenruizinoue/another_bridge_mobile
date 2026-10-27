// Session endpoints. Thin wrappers over apiGet that own their URL/query
// construction and return already-typed data to the screens.
import { apiGet, apiPost, streamSSE } from './client';
import type { MessagesPage, SessionCard, TerminalInfo, ToolRef } from './types';

// A base64 image to attach (raw base64, no data: prefix).
export type OutgoingImage = { media_type: string; data: string };

// A base64 file to attach (PDF, csv, txt, …). The bridge saves it on the
// Mac and points claude at the path — the model Reads it itself, so any
// text-readable extension works without inflating the prompt.
export type OutgoingFile = { name: string; data: string };

// Why queued messages wait: the session is working in a terminal tab on
// the Mac, or the bridge's cap on phone turns running at once is reached.
export type HoldReason = 'terminal' | 'limit';

export type ResumeStatus = {
  running: boolean;
  started_at: number | null;
  queued: string[]; // messages waiting to run, in order
  queue_count: number;
  held?: HoldReason | null; // missing on older bridges
  terminal?: TerminalInfo | null;
};

// The catch-up signal: is a resume running or are messages queued on the
// Mac? Survives a dropped stream / killed app, so a reconnecting client
// polls this until BOTH running and queued are empty.
export async function resumeStatus(sessionId: string): Promise<ResumeStatus> {
  return apiGet<ResumeStatus>(`/sessions/${sessionId}/resume/status`);
}

// Queue a message server-side. The bridge runs it (and other queued
// messages, in order) even if the phone locks or the app is killed.
export async function enqueueResume(
  sessionId: string,
  message: string,
  images: OutgoingImage[] = [],
  files: OutgoingFile[] = [],
  voice = false,
): Promise<{ ok: boolean; session_id: string; queued: number }> {
  return apiPost(`/sessions/${sessionId}/resume/queue`, {
    message,
    images,
    files,
    ...(voice && { voice: true }),
  });
}

// "Send anyway": queued messages stop waiting for the terminal tab and
// the turn cap. They still run one at a time.
export async function releaseQueue(
  sessionId: string,
): Promise<{ ok: boolean; session_id: string; released: number }> {
  return apiPost(`/sessions/${sessionId}/resume/queue/release`, {});
}

export type StreamHandlers = {
  onText: (chunk: string) => void; // a token / text chunk
  onTool: (tool: ToolRef) => void; // a tool step surfaced
  onDone: () => void; // the `done` event — response truly finished
  onError: (message: string) => void; // couldn't start / bridge error
  onInterrupted: () => void; // connection dropped mid-stream; the message
  // was sent and Claude may still be finishing on the Mac
  onSpeech?: (speech: string) => void; // voice turns only: the schema-
  // guaranteed spoken summary, emitted just before `done`
  onQueued?: (reason: HoldReason) => void; // the bridge held the message
  // in its queue instead of running it (a working terminal tab or the
  // turn cap); `done` follows, and the queue runs it later
};

// A tool step from an SSE `tool` payload, with safe defaults.
function toTool(payload: any): ToolRef {
  return { name: payload.name ?? '', label: payload.label ?? '', stat: payload.stat ?? null };
}

// Streaming resume: reads the SSE the bridge emits and dispatches each
// event to a handler so the UI can render tokens as they arrive. Never
// throws — failures come through onError. Returns a cancel function.
export function resumeSessionStream(
  sessionId: string,
  message: string,
  h: StreamHandlers,
  images: OutgoingImage[] = [],
  files: OutgoingFile[] = [],
  voice = false,
): () => void {
  let errored = false;
  let gotDone = false;
  return streamSSE(
    `/sessions/${sessionId}/resume/stream`,
    { message, images, files, ...(voice && { voice: true }) },
    (ev, payload) => {
      if (ev === 'text') h.onText(payload.chunk ?? '');
      else if (ev === 'tool') h.onTool(toTool(payload));
      else if (ev === 'speech') h.onSpeech?.(payload.speech ?? '');
      else if (ev === 'queued') h.onQueued?.(payload.reason === 'limit' ? 'limit' : 'terminal');
      else if (ev === 'done') {
        gotDone = true;
        h.onDone(); // the ONLY reliable "finished" signal
      } else if (ev === 'error') {
        errored = true;
        h.onError(payload.message ?? 'stream error');
      }
    },
    (err) => {
      if (gotDone || errored) return; // completion/error already delivered
      if (err) h.onError(err); // never reached the bridge / HTTP error
      else h.onInterrupted(); // closed WITHOUT a done event → dropped mid-flight
    },
  );
}

export type AttachHandlers = {
  onText: (chunk: string) => void;
  onTool: (tool: ToolRef) => void;
  onDone: () => void; // the turn ended, or nothing was running
  onDropped: (status?: number) => void; // ended without done; 404 = a
  // bridge without /resume/attach
};

// Watch a turn that is already running (after leaving the chat, a dropped
// stream or a relaunch). Fetch the transcript first: the bridge replays
// only the message being written now, then streams the rest live.
export function attachResumeStream(sessionId: string, h: AttachHandlers): () => void {
  let gotDone = false;
  return streamSSE(
    `/sessions/${sessionId}/resume/attach`,
    undefined,
    (ev, payload) => {
      if (ev === 'text') h.onText(payload.chunk ?? '');
      else if (ev === 'tool') h.onTool(toTool(payload));
      else if (ev === 'done') {
        gotDone = true;
        h.onDone();
      }
    },
    (_err, status) => {
      if (!gotDone) h.onDropped(status);
    },
  );
}

export async function fetchSessions(limit = 100): Promise<SessionCard[]> {
  const data = await apiGet<{ sessions: SessionCard[] }>(`/sessions?limit=${limit}`);
  return data.sessions;
}

// One newest-first page of a conversation. Omit `before` for the latest
// page, then pass the returned `next_before` to walk toward the top.
export async function fetchMessages(
  sessionId: string,
  before?: number | null,
  limit = 50,
): Promise<MessagesPage> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (before != null) q.set('before', String(before));
  return apiGet<MessagesPage>(`/sessions/${sessionId}/messages?${q}`);
}
