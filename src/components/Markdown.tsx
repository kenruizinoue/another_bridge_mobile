import { StyleSheet, Text, View } from 'react-native';
import { parseMarkdown, type Block, type InlineToken } from '../lib/markdown';
import { colors, font, mono, space } from '../theme';

// Renders the markdown AST as terminal-flavoured RN. Everything stays
// monospace; markdown only adds emphasis, headings, code and list markers
// so it reads like `glow` in a terminal rather than a glossy chat app.
export default function Markdown({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <View>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading':
      return (
        <Text style={[styles.base, styles.heading, headingSize(block.level)]} selectable>
          <Inlines tokens={block.inlines} />
        </Text>
      );
    case 'bullet':
      return (
        <View style={styles.listRow}>
          <Text style={[styles.base, styles.marker]}>•</Text>
          <Text style={[styles.base, styles.listBody]} selectable>
            <Inlines tokens={block.inlines} />
          </Text>
        </View>
      );
    case 'ordered':
      return (
        <View style={styles.listRow}>
          <Text style={[styles.base, styles.marker]}>{block.marker}</Text>
          <Text style={[styles.base, styles.listBody]} selectable>
            <Inlines tokens={block.inlines} />
          </Text>
        </View>
      );
    case 'code':
      return (
        <View style={styles.codeBlock}>
          <Text style={styles.codeText} selectable>
            {block.content}
          </Text>
        </View>
      );
    default:
      return (
        <Text style={[styles.base, styles.paragraph]} selectable>
          <Inlines tokens={block.inlines} />
        </Text>
      );
  }
}

function Inlines({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === 'bold') return <Text key={i} style={styles.bold}>{t.value}</Text>;
        if (t.type === 'italic') return <Text key={i} style={styles.italic}>{t.value}</Text>;
        if (t.type === 'code') return <Text key={i} style={styles.inlineCode}>{t.value}</Text>;
        return <Text key={i}>{t.value}</Text>;
      })}
    </>
  );
}

function headingSize(level: number) {
  if (level <= 1) return { fontSize: font.h1 };
  if (level === 2) return { fontSize: font.h2 };
  return { fontSize: font.h3 };
}

const styles = StyleSheet.create({
  base: { color: colors.textBody, fontSize: font.body, fontFamily: mono, lineHeight: 20 },
  paragraph: { marginBottom: space.sm },
  heading: { color: colors.textPrimary, fontWeight: '700', marginTop: space.xs, marginBottom: space.sm },
  bold: { fontWeight: '700', color: colors.textPrimary },
  italic: { fontStyle: 'italic' },
  inlineCode: { color: colors.codeText, backgroundColor: colors.codeBg, fontFamily: mono },
  listRow: { flexDirection: 'row', marginBottom: space.xs, paddingRight: space.sm },
  marker: { color: colors.accent, marginRight: space.sm },
  listBody: { flex: 1 },
  codeBlock: {
    backgroundColor: colors.codeBg,
    borderRadius: 6,
    padding: space.md,
    marginVertical: space.sm,
  },
  codeText: { color: colors.codeText, fontSize: font.small, fontFamily: mono, lineHeight: 18 },
});
