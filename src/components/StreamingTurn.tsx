import { StyleSheet, Text, View } from 'react-native';
import type { ToolRef } from '../api/types';
import { colors, font, mono, space } from '../theme';
import ToolLines from './ToolLines';

// The live reply as it streams in. Rendered as plain monospace (not
// markdown) with a blinking-ish cursor while tokens arrive; once `done`
// fires, the screen replaces it with the canonical, markdown-rendered
// turn. Tool steps appear as they're surfaced.
export default function StreamingTurn({ text, tools }: { text: string; tools: ToolRef[] }) {
  return (
    <View style={styles.turn}>
      <Text style={styles.role}>● claude</Text>
      <Text style={styles.body} selectable>
        {text}
        <Text style={styles.cursor}>▋</Text>
      </Text>
      {tools.length ? (
        <View style={{ marginTop: space.sm }}>
          <ToolLines tools={tools} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  turn: { marginBottom: space.lg + 2 },
  role: { color: colors.accent, fontSize: font.small, fontFamily: mono, marginBottom: space.xs },
  body: { color: colors.textBody, fontSize: font.body, lineHeight: 20, fontFamily: mono },
  cursor: { color: colors.accent },
});
