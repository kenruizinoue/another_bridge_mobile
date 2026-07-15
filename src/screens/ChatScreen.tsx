import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OutgoingFile, OutgoingImage } from '../api/sessions';
import type { SessionCard } from '../api/types';
import ChatStatusBar from '../components/ChatStatusBar';
import Composer from '../components/Composer';
import GlassIconButton from '../components/GlassIconButton';
import StreamingTurn from '../components/StreamingTurn';
import TurnRow from '../components/TurnRow';
import useAttachments, { MAX_FILES, MAX_IMAGES } from '../hooks/useAttachments';
import useChatSession from '../hooks/useChatSession';
import useVoiceInput from '../hooks/useVoiceInput';
import { colors, font, mono, space } from '../theme';

// Terminal-style conversation view: full width, no bubbles, monospace,
// max reading space. Newest at the bottom (inverted); scrolling up loads
// older turns. All conversation/send/queue state lives in useChatSession;
// image picking in useAttachments — this screen is layout + wiring.
export default function ChatScreen({
  session,
  onBack,
}: {
  session: SessionCard;
  onBack: () => void;
}) {
  const chat = useChatSession(session.session_id);
  const [draft, setDraft] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  const images = useAttachments(setPickError);
  const voice = useVoiceInput({
    // Dictation lands in the draft (appended after any typed text) — the
    // user still reviews and taps send themselves.
    onText: (text) =>
      setDraft((current) => (current.trim() ? `${current.replace(/\s+$/, '')} ${text}` : text)),
    onError: setPickError,
  });

  const handleSend = useCallback(() => {
    const message = draft.trim();
    const out: OutgoingImage[] = images.attachments.map((a) => ({
      media_type: 'image/jpeg',
      data: a.base64,
    }));
    const outFiles: OutgoingFile[] = images.files.map((f) => ({
      name: f.name,
      data: f.base64,
    }));
    if (!message && out.length === 0 && outFiles.length === 0) return;
    const sentImages = images.attachments; // to restore on failure
    const sentFiles = images.files;
    setDraft('');
    images.clear();
    setPickError(null);
    void chat.send(message, out, outFiles, () => {
      // Send never started — hand the message back to the composer.
      setDraft(message);
      images.restore(sentImages, sentFiles);
    });
  }, [draft, images, chat]);

  const busy = chat.sending || chat.syncing || chat.queued.length > 0;

  // Inverted list → contentOffset.y 0 is the visual bottom. Tracked so the
  // "new reply" pill only shows while reading older turns during a stream.
  const listRef = useRef<FlatList>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const showJumpPill = awayFromBottom && chat.sending;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <GlassIconButton name="chevron-back" onPress={onBack} size={40} testID="chat-back" />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {session.title}
        </Text>
        <GlassIconButton
          name="refresh"
          onPress={chat.refresh}
          disabled={chat.loading}
          busy={chat.refreshing}
          size={40}
          testID="chat-refresh"
        />
      </View>
      <Text style={styles.subheader} numberOfLines={1} ellipsizeMode="head">
        {session.project} · {session.message_count} msgs
      </Text>

      {chat.loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Loading conversation…</Text>
        </View>
      ) : chat.error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t load</Text>
          <Text style={styles.errorMsg}>{chat.error}</Text>
        </View>
      ) : (
        <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            testID="chat-list"
            data={chat.turns}
            inverted
            keyExtractor={(t) => String(t.index)}
            renderItem={({ item }) => <TurnRow turn={item} />}
            contentContainerStyle={styles.listContent}
            // Anchor the first visible row so a growing stream below never
            // drags the reader; within 80px of the bottom it auto-follows.
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
              autoscrollToTopThreshold: 80,
            }}
            onScroll={(e) => setAwayFromBottom(e.nativeEvent.contentOffset.y > 80)}
            scrollEventThrottle={100}
            // Inverted list → the header renders at the visual BOTTOM, below
            // the just-sent user turn, which is exactly where the live reply
            // should stream in.
            ListHeaderComponent={
              chat.sending ? (
                <StreamingTurn text={chat.streamText} tools={chat.streamTools} />
              ) : null
            }
            onEndReached={chat.loadOlder}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              chat.loadingMore ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
              ) : !chat.hasMore && chat.turns.length ? (
                <Text style={styles.topMarker}>— start of conversation —</Text>
              ) : null
            }
          />
          {showJumpPill ? (
            <Pressable
              testID="jump-to-latest"
              style={styles.jumpPill}
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
            >
              <Ionicons name="arrow-down" size={13} color={colors.accent} />
              <Text style={styles.jumpPillText}>new reply</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ChatStatusBar
          queued={chat.queued}
          sending={chat.sending}
          syncing={chat.syncing}
          streaming={!!chat.streamText}
          sendError={chat.sendError ?? pickError}
        />
        <Composer
          draft={draft}
          onChangeDraft={setDraft}
          attachments={images.attachments}
          files={images.files}
          onPickImages={() => {
            setPickError(null);
            void images.pick();
          }}
          onPickFiles={() => {
            setPickError(null);
            void images.pickFiles();
          }}
          onRemoveAttachment={images.remove}
          onRemoveFile={images.removeFile}
          canAttachImages={images.attachments.length < MAX_IMAGES}
          canAttachFiles={images.files.length < MAX_FILES}
          busy={busy}
          voiceStatus={voice.status}
          onMicPress={() => {
            setPickError(null);
            voice.toggle();
          }}
          onSend={handleSend}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  headerTitle: { color: colors.textPrimary, fontSize: font.title, fontWeight: '600', flex: 1 },
  subheader: {
    color: colors.textFaint,
    fontSize: font.tiny,
    fontFamily: mono,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  listWrap: { flex: 1 },
  listContent: { paddingHorizontal: space.md, paddingVertical: space.md },
  jumpPill: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(94,177,255,0.35)',
    backgroundColor: 'rgba(13,19,26,0.92)',
  },
  jumpPillText: { color: colors.accent, fontSize: font.tiny, fontFamily: mono },
  topMarker: { color: '#4a5666', fontSize: font.tiny, fontFamily: mono, textAlign: 'center', marginVertical: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: space.sm },
  dim: { color: colors.textDim, fontSize: font.meta },
  errorTitle: { color: colors.error, fontSize: font.title, fontWeight: '600' },
  errorMsg: { color: '#c0c9d4', fontSize: font.meta, textAlign: 'center' },
});
