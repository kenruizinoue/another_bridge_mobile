// Decides WHEN a finished reply should be spoken. The screen feeds it the
// conversation and chat state on every change; it answers with the speech
// text exactly once per turn. The arm/settle dance prevents speaking a
// stale assistant turn that was already on screen before the send flipped
// the chat to busy.
import { speechForReply } from './speechReply';

export type ReplyWatcherInput = {
  /** Conversation machine sits in waitingReply. */
  waiting: boolean;
  /** The chat is sending, syncing, or draining a queue. */
  busy: boolean;
  /** Newest assistant turn's text, if any. */
  latestAssistantText: string | null;
  /** Tool calls on that turn, for the canned fallback. */
  toolCount: number;
  /** The bridge's schema-guaranteed summary (voice turns). Wins over
   *  marker parsing when present. */
  schemaSpeech?: string | null;
};

export function createReplyWatcher() {
  let armed = false;

  return {
    /** Returns the text to speak, or null. Call on every state change. */
    update(current: ReplyWatcherInput): string | null {
      if (!current.waiting) {
        armed = false;
        return null;
      }
      if (current.busy) {
        armed = true;
        return null;
      }
      if (!armed) return null;
      if (current.schemaSpeech) {
        armed = false;
        return current.schemaSpeech;
      }
      if (current.latestAssistantText === null) return null;
      armed = false;
      return speechForReply(current.latestAssistantText, current.toolCount);
    },
  };
}
