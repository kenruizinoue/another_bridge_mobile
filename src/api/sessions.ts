// Session endpoints. Thin wrappers over apiGet that own their URL/query
// construction and return already-typed data to the screens.
import { apiGet, apiPost, streamSSE } from './client';
import type { MessagesPage, SessionCard, ToolRef } from './types';

export type ResumeResult = { ok: boolean; session_id: string; reply: string };

// Continue a session: appends the message (+ Claude's reply) to the
// transcript on the Mac via `claude --resume`. Resolves when the turn
// finishes; the caller then re-fetches messages for the canonical turns.
export async function resumeSession(sessionId: string, message: string): Promise<ResumeResult> {
  return apiPost<ResumeResult>(`/sessions/${sessionId}/resume`, { message });
}

export type StreamHandlers = {
  onText: (chunk: string) => void; // a token / text chunk
  onTool: (tool: ToolRef) => void; // a tool step surfaced
  onDone: () => void; // stream completed cleanly
  onError: (message: string) => void; // transport or bridge error
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
  return streamSSE(
    `/sessions/${sessionId}/resume/stream`,
    { message },
    (ev, payload) => {
      if (ev === 'text') h.onText(payload.chunk ?? '');
      else if (ev === 'tool')
        h.onTool({ name: payload.name ?? '', label: payload.label ?? '', stat: payload.stat ?? null });
      else if (ev === 'error') {
        errored = true;
        h.onError(payload.message ?? 'stream error');
      }
      // 'done' is covered by onEnd below
    },
    (err) => {
      if (errored) return;
      if (err) h.onError(err);
      else h.onDone();
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
