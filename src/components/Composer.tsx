import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { Attachment } from '../hooks/useAttachments';
import { colors, font, mono, space } from '../theme';
import GlassIconButton from './GlassIconButton';

// The message composer: thumbnail strip (when images are attached) plus
// the input row — attach button, growing text input, send button. Pure
// presentation; all state lives in the screen's hooks.
export default function Composer({
  draft,
  onChangeDraft,
  attachments,
  onPickImages,
  onRemoveAttachment,
  canAttach,
  busy,
  onSend,
}: {
  draft: string;
  onChangeDraft: (text: string) => void;
  attachments: Attachment[];
  onPickImages: () => void;
  onRemoveAttachment: (uri: string) => void;
  canAttach: boolean;
  busy: boolean; // a turn is running / queued → sending will queue
  onSend: () => void;
}) {
  const hasContent = !!draft.trim() || attachments.length > 0;
  return (
    <>
      {attachments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.thumbStrip}
          contentContainerStyle={styles.thumbStripContent}
        >
          {attachments.map((a) => (
            <View key={a.uri} style={styles.thumbWrap}>
              <Image source={{ uri: a.uri }} style={styles.thumb} />
              <Pressable
                testID={`thumb-remove-${a.uri}`}
                onPress={() => onRemoveAttachment(a.uri)}
                hitSlop={6}
                style={styles.thumbRemove}
              >
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.inputRow}>
        <GlassIconButton
          name="images-outline"
          onPress={onPickImages}
          disabled={!canAttach}
          size={38}
          testID="composer-attach"
        />
        <TextInput
          testID="composer-input"
          style={styles.input}
          value={draft}
          onChangeText={onChangeDraft}
          // Always editable — typing while a turn runs QUEUES the message.
          placeholder={busy ? 'Queue a message…' : 'Message… (continues this session)'}
          placeholderTextColor="#4a5666"
          multiline
        />
        <GlassIconButton
          name="arrow-up"
          onPress={onSend}
          disabled={!hasContent}
          filled={hasContent}
          size={40}
          testID="composer-send"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.inputBg,
  },
  input: {
    flex: 1,
    color: colors.textBody,
    fontSize: font.title,
    fontFamily: mono,
    lineHeight: 20,
    // Single line renders exactly 20 + 9 + 9 = 38px — the attach button's
    // height — so with the row's alignItems: 'center' the input, attach,
    // and send all share a vertical center instead of drifting a few px.
    minHeight: 38,
    maxHeight: 110,
    paddingVertical: 9,
    paddingHorizontal: 0,
  },
  thumbStrip: { backgroundColor: colors.inputBg, borderTopWidth: 1, borderTopColor: colors.divider },
  thumbStripContent: { padding: space.sm, gap: space.sm },
  thumbWrap: { width: 60, height: 60 },
  thumb: { width: 60, height: 60, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
