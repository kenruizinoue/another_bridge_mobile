import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HoldReason } from '../api/sessions';
import type { TerminalInfo } from '../api/types';
import { colors, font, mono, space } from '../theme';

// The strip above the composer: queued messages waiting on the Mac, the
// working indicator while a turn runs, a terminal tab working on this
// session, or the last send error.
export function workingLabel({
  queued,
  sending,
  live,
  streaming,
  offline,
  held = null,
}: {
  queued: number;
  sending: boolean;
  live: boolean;
  streaming: boolean;
  offline: boolean;
  held?: HoldReason | null;
}): string {
  if (offline) return 'reconnecting to the Mac…';
  if (streaming) return 'streaming…';
  // Queued messages waiting for the turn ahead of them to start, for the
  // terminal tab to finish, or for a free slot under the bridge's cap.
  if (queued > 0 && !sending && !live) {
    if (held === 'terminal') return `${queued} queued until the Mac terminal is done…`;
    if (held === 'limit') return `${queued} queued, other phone turns are running…`;
    return `${queued} queued, waiting to start…`;
  }
  return 'claude is working on the Mac…';
}

// "working in the Mac terminal, 2 agents running"
export function terminalLabel(terminal: TerminalInfo): string {
  const agents = terminal.agents === 1 ? '1 agent running' : `${terminal.agents} agents running`;
  return terminal.agents > 0 ? `working in the Mac terminal, ${agents}` : 'working in the Mac terminal';
}

export default function ChatStatusBar({
  queued,
  sending,
  syncing,
  live = false,
  offline = false,
  streaming,
  sendError,
  held = null,
  terminal = null,
  onSendAnyway,
}: {
  queued: string[];
  sending: boolean;
  syncing: boolean;
  live?: boolean;
  offline?: boolean;
  streaming: boolean;
  sendError: string | null;
  held?: HoldReason | null;
  terminal?: TerminalInfo | null;
  onSendAnyway?: () => void;
}) {
  const waiting = queued.length > 0 && !!held && !sending && !live;
  return (
    <>
      {queued.length > 0 ? (
        <View style={styles.queueList}>
          {queued.map((m, i) => (
            <Text key={i} style={styles.queueItem} numberOfLines={1}>
              ⋯ {m}
            </Text>
          ))}
        </View>
      ) : null}

      {sending || syncing ? (
        // Persists until the run truly finishes (the `done` event, or
        // catch-up seeing running=false AND the queue empty).
        <View style={styles.bar}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.workingText}>
            {workingLabel({ queued: queued.length, sending, live, streaming, offline, held })}
          </Text>
          {waiting && onSendAnyway ? (
            <Pressable
              testID="send-anyway"
              accessibilityRole="button"
              onPress={onSendAnyway}
              style={styles.sendAnyway}
            >
              <Text style={styles.sendAnywayText}>Send anyway</Text>
            </Pressable>
          ) : null}
        </View>
      ) : terminal?.active ? (
        // A terminal tab is working on this session. New messages wait in
        // the bridge's queue until it's done, and its replies show here.
        <View style={styles.bar}>
          <ActivityIndicator size="small" color={colors.textDim} />
          <Text style={styles.workingText}>{terminalLabel(terminal)}</Text>
        </View>
      ) : sendError ? (
        <View style={styles.bar}>
          <Text style={styles.errorText} numberOfLines={2}>
            ✕ {sendError}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.inputBg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  workingText: { color: colors.textDim, fontSize: font.small, fontFamily: mono, flexShrink: 1 },
  sendAnyway: {
    marginLeft: 'auto',
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
  },
  sendAnywayText: { color: colors.accent, fontSize: font.small, fontFamily: mono },
  errorText: { color: colors.error, fontSize: font.small, fontFamily: mono, flex: 1 },
  queueList: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: 2,
    backgroundColor: colors.inputBg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  queueItem: { color: colors.textFaint, fontSize: font.small, fontFamily: mono },
});
