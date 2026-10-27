import { StyleSheet, Text, View } from 'react-native';
import { splitPaths } from '../lib/filePaths';
import { parseMarkdown, type Block, type InlineToken } from '../lib/markdown';
import { colors, font, mono, space } from '../theme';

// Renders the markdown AST as terminal-flavoured RN. Everything stays
// monospace; markdown only adds emphasis, headings, code and list markers
// so it reads like `glow` in a terminal rather than a glossy chat app.
// With `onPathPress`, file paths in the text become tappable links.
export default function Markdown({
  content,
  onPathPress,
}: {
  content: string;
  onPathPress?: (path: string) => void;
}) {
  const blocks = parseMarkdown(content);
  return (
    <View>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} onPathPress={onPathPress} />
      ))}
    </View>
  );
}

type PathPress = ((path: string) => void) | undefined;

function BlockView({ block, onPathPress }: { block: Block; onPathPress: PathPress }) {
  switch (block.type) {
    case 'heading':
      return (
        <Text style={[styles.base, styles.heading, headingSize(block.level)]} selectable>
          <Inlines tokens={block.inlines} onPathPress={onPathPress} />
        </Text>
      );
    case 'bullet':
      return (
        <View style={styles.listRow}>
          <Text style={[styles.base, styles.marker]}>•</Text>
          <Text style={[styles.base, styles.listBody]} selectable>
            <Inlines tokens={block.inlines} onPathPress={onPathPress} />
          </Text>
        </View>
      );
    case 'ordered':
      return (
        <View style={styles.listRow}>
          <Text style={[styles.base, styles.marker]}>{block.marker}</Text>
          <Text style={[styles.base, styles.listBody]} selectable>
            <Inlines tokens={block.inlines} onPathPress={onPathPress} />
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
          <Inlines tokens={block.inlines} onPathPress={onPathPress} />
        </Text>
      );
  }
}

function Inlines({ tokens, onPathPress }: { tokens: InlineToken[]; onPathPress: PathPress }) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === 'bold') return <Text key={i} style={styles.bold}>{t.value}</Text>;
        if (t.type === 'italic') return <Text key={i} style={styles.italic}>{t.value}</Text>;
        if (t.type === 'code') {
          return (
            <Text key={i} style={styles.inlineCode}>
              <Linked value={t.value} onPathPress={onPathPress} />
            </Text>
          );
        }
        return (
          <Text key={i}>
            <Linked value={t.value} onPathPress={onPathPress} />
          </Text>
        );
      })}
    </>
  );
}

// Plain text with any file paths turned into links.
function Linked({ value, onPathPress }: { value: string; onPathPress: PathPress }) {
  if (!onPathPress) return <>{value}</>;
  return (
    <>
      {splitPaths(value).map((part, i) =>
        part.type === 'path' ? (
          <Text
            key={i}
            style={styles.path}
            accessibilityRole="link"
            onPress={() => onPathPress(part.value)}
            testID={`path-link-${part.value}`}
          >
            {part.value}
          </Text>
        ) : (
          part.value
        ),
      )}
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
  path: { color: colors.accent, textDecorationLine: 'underline' },
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
