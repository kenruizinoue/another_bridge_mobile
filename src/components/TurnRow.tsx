import { StyleSheet, Text, View } from 'react-native';
import type { Turn } from '../api/types';
import { colors, font, mono, space } from '../theme';
import Markdown from './Markdown';
import ToolLines from './ToolLines';

// One conversation turn. Claude's replies are markdown (rendered); the
// user's turns are shown literally (what they typed, verbatim). Tool
// steps render as detail lines instead of a bare count.
export default function TurnRow({ turn }: { turn: Turn }) {
  if (turn.role === 'tool') {
    return (
      <View style={styles.turn}>
        {turn.tools.length ? (
          <ToolLines tools={turn.tools} />
        ) : (
          <Text style={styles.toolFallback}>⚙ tool step</Text>
        )}
      </View>
    );
  }

  const isUser = turn.role === 'user';
  return (
    <View style={styles.turn}>
      <Text style={[styles.role, isUser ? styles.roleUser : styles.roleAssistant]}>
        {isUser ? '❯ you' : '● claude'}
      </Text>

      {isUser ? (
        <Text style={styles.userText} selectable>
          {turn.text}
        </Text>
      ) : (
        <Markdown content={turn.text ?? ''} />
      )}

      {turn.tools.length ? (
        <View style={styles.inlineTools}>
          <ToolLines tools={turn.tools} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  turn: { marginBottom: space.lg + 2 },
  role: { fontSize: font.small, fontFamily: mono, marginBottom: space.xs },
  roleUser: { color: colors.user },
  roleAssistant: { color: colors.accent },
  userText: { color: colors.textBody, fontSize: font.body, lineHeight: 20, fontFamily: mono },
  inlineTools: { marginTop: space.sm },
  toolFallback: { color: colors.tool, fontSize: font.small, fontFamily: mono, fontStyle: 'italic' },
});
