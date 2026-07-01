// Session endpoints. Thin wrappers over apiGet that own their URL/query
// construction and return already-typed data to the screens.
import { apiGet, apiPost, streamSSE } from './client';
import type { MessagesPage, SessionCard, ToolRef } from './types';

export type ResumeResult = { ok: boolean; session_id: string; reply: string };

export type ResumeStatus = {
  running: boolean;
  started_at: number | null;
  queued: string[]; // messages waiting to run, in order
  queue_count: number;
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
): Promise<{ ok: boolean; session_id: string; queued: number }> {
  return apiPost(`/sessions/${sessionId}/resume/queue`, { message });
}

// Continue a session: appends the message (+ Claude's reply) to the
// transcript on the Mac via `claude --resume`. Resolves when the turn
// finishes; the caller then re-fetches messages for the canonical turns.
export async function resumeSession(sessionId: string, message: string): Promise<ResumeResult> {
  return apiPost<ResumeResult>(`/sessions/${sessionId}/resume`, { message });
}

export type StreamHandlers = {
  onText: (chunk: string) => void; // a token / text chunk
  onTool: (tool: ToolRef) => void; // a tool step surfaced
  onDone: () => void; // the `done` event — response truly finished
  onError: (message: string) => void; // couldn't start / bridge error
  onInterrupted: () => void; // connection dropped mid-stream; the message
  // was sent and Claude may still be finishing on the Mac
};

// Streaming resume: reads the SSE the bridge emits and dispatches each
// event to a handler so the UI can render tokens as they arrive. Never
// throws — failures come through onError. Returns a cancel function.
export function resumeSessionStream(
  sessionId: string,
  message: string,
  h: StreamHandlers,
): () => void {
  let errored = false;
  let gotDone = false;
  return streamSSE(
    `/sessions/${sessionId}/resume/stream`,
    { message },
    (ev, payload) => {
      if (ev === 'text') h.onText(payload.chunk ?? '');
      else if (ev === 'tool')
        h.onTool({ name: payload.name ?? '', label: payload.label ?? '', stat: payload.stat ?? null });
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
