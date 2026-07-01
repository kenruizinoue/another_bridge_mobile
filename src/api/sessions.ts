// Session endpoints. Thin wrappers over apiGet that own their URL/query
// construction and return already-typed data to the screens.
import { apiGet } from './client';
import type { MessagesPage, SessionCard } from './types';

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
