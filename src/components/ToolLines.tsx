import { StyleSheet, Text } from 'react-native';
import type { ToolRef } from '../api/types';
import { colors, font, mono } from '../theme';

// The per-tool detail lines: "⚙ Update(config.py)  +14 -2".
export default function ToolLines({ tools }: { tools: ToolRef[] }) {
  return (
    <>
      {tools.map((t, i) => (
        <Text key={i} style={styles.line}>
          ⚙ {t.label}
          {t.stat ? <Text style={styles.stat}>{`  ${t.stat}`}</Text> : null}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  line: { color: colors.tool, fontSize: font.small, fontFamily: mono, lineHeight: 18 },
  stat: { color: colors.stat },
});
