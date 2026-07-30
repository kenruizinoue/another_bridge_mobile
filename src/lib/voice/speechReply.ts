// What the phone actually says after a reply lands. The model is asked
// (via the suffix) to end conversation-mode replies with a SPEECH: line;
// we speak only that line. When it is missing we never extract from the
// reply body, we fall back to a short canned status built from metadata.

/**
 * Appended to every outgoing message while conversation mode is on.
 * Kept to one constant paragraph so the session transcript stays tidy.
 */
export const VOICE_MODE_SUFFIX =
  '\n\n[voice mode: end your reply with one final line starting with "SPEECH: " ' +
  'containing one or two short spoken sentences that summarize the reply for ' +
  'audio, with no code, no file paths, and no markdown]';

/**
 * Extract the spoken summary from a reply: the LAST line starting with
 * "SPEECH:" outside of code fences. Returns null when absent or empty.
 */
export function parseSpeechMarker(reply: string): string | null {
  let inFence = false;
  let speech: string | null = null;
  for (const raw of reply.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.startsWith('SPEECH:')) {
      const content = line.slice('SPEECH:'.length).trim();
      if (content) speech = content;
    }
  }
  return speech;
}

/** Metadata-only status line for replies without a usable marker. */
export function cannedStatus(toolCount: number): string {
  if (toolCount === 1) return 'Done, I used 1 tool, details on screen.';
  if (toolCount > 1) return `Done, I used ${toolCount} tools, details on screen.`;
  return 'Done, the reply is on screen.';
}

/** The text to speak for a finished reply. */
export function speechForReply(reply: string, toolCount: number): string {
  return parseSpeechMarker(reply) ?? cannedStatus(toolCount);
}
