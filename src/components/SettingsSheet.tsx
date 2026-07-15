import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getOpenAiApiKey } from '../lib/env';
import {
  getTranscribePreference,
  getVoiceLanguage,
  setTranscribePreference,
  setVoiceLanguage,
} from '../lib/transcription/preference';
import type { TranscriptionEngine, VoiceLanguage } from '../lib/transcription/types';
import {
  WHISPER_MODEL_SIZE_MB,
  whisperModel,
  type WhisperModelState,
} from '../lib/transcription/whisperModel';
import { colors, font, mono, space } from '../theme';
import GlassIconButton from './GlassIconButton';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { key: TranscriptionEngine; label: string; icon: IoniconName }[] = [
  { key: 'apple', label: 'Apple', icon: 'phone-portrait' },
  { key: 'whisper', label: 'Whisper', icon: 'sparkles' },
  { key: 'openai', label: 'OpenAI', icon: 'cloud' },
];

const LANGUAGES: { key: VoiceLanguage; label: string }[] = [
  { key: 'en-US', label: 'English' },
  { key: 'es-ES', label: 'Español' },
];

// Settings sheet opened from the session list header. Today it holds the
// voice transcription engine choice (same three tabs as another_interviewer)
// and the app version. Selecting Whisper kicks the one-time model download.
export default function SettingsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [engine, setEngine] = useState<TranscriptionEngine>('apple');
  const [language, setLanguage] = useState<VoiceLanguage>('en-US');
  const [modelState, setModelState] = useState<WhisperModelState>('unknown');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) return;
    void getTranscribePreference().then(setEngine);
    void getVoiceLanguage().then(setLanguage);
    void whisperModel.isReady().then(() => setModelState(whisperModel.getState()));
  }, [visible]);

  const downloadModel = useCallback(async () => {
    setProgress(0);
    setModelState('downloading');
    await whisperModel.ensureReady(setProgress);
    setModelState(whisperModel.getState());
  }, []);

  const select = useCallback(
    async (next: TranscriptionEngine) => {
      setEngine(next);
      await setTranscribePreference(next);
      if (next === 'whisper' && !(await whisperModel.isReady())) {
        void downloadModel();
      } else {
        setModelState(whisperModel.getState());
      }
    },
    [downloadModel],
  );

  const hasKey = getOpenAiApiKey() !== null;
  const description =
    engine === 'apple'
      ? 'On-device Apple Speech. Free, offline, audio never leaves the phone.'
      : engine === 'whisper'
        ? `On-device Whisper (small, multilingual). More accurate; one-time ${WHISPER_MODEL_SIZE_MB}MB model download.`
        : 'Cloud transcription with your OpenAI key.';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.title}>Settings</Text>
            <View style={styles.spacer} />
            <GlassIconButton name="close" onPress={onClose} size={34} testID="settings-close" />
          </View>

          <Text style={styles.sectionLabel}>voice transcription</Text>
          <View style={styles.tabs}>
            {TABS.map((tab) => {
              const active = tab.key === engine;
              return (
                <Pressable
                  key={tab.key}
                  testID={`engine-${tab.key}`}
                  onPress={() => void select(tab.key)}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Ionicons
                    name={tab.icon}
                    size={15}
                    color={active ? colors.accent : colors.textDim}
                  />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.description}>{description}</Text>

          {engine === 'openai' && !hasKey ? (
            <View style={styles.keyWarning} testID="openai-key-warning">
              <Ionicons name="warning" size={15} color="#e0b34d" />
              <Text style={styles.keyWarningText}>
                No OpenAI key found. Add EXPO_PUBLIC_OPENAI_API_KEY to .env.local and rebuild the
                app — until then this engine is skipped and dictation falls back to the on-device
                ones.
              </Text>
            </View>
          ) : null}

          {engine === 'whisper' ? (
            modelState === 'ready' ? (
              <Text style={styles.modelReady}>✓ model downloaded</Text>
            ) : modelState === 'downloading' ? (
              <View style={styles.progressBlock}>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
                  />
                </View>
                <Text style={styles.progressText}>
                  downloading model… {Math.round(progress * 100)}%
                </Text>
                <Text style={styles.downloadWarning} testID="download-warning">
                  Keep the app open — leaving it cancels the download.
                </Text>
              </View>
            ) : modelState === 'error' ? (
              <Pressable onPress={() => void downloadModel()} testID="whisper-retry">
                <Text style={styles.modelError}>download failed — tap to retry</Text>
              </Pressable>
            ) : null
          ) : null}

          <Text style={styles.sectionLabel}>language</Text>
          <View style={styles.tabs}>
            {LANGUAGES.map((item) => {
              const active = item.key === language;
              return (
                <Pressable
                  key={item.key}
                  testID={`language-${item.key}`}
                  onPress={() => {
                    setLanguage(item.key);
                    void setVoiceLanguage(item.key);
                  }}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.description}>
            Applied to every engine, so nothing has to guess the language.
          </Text>

          <Text style={styles.fallbackNote}>
            If the selected engine fails, the others are tried automatically.
          </Text>

          <Text style={styles.version} testID="settings-version">
            another_bridge_mobile v{Constants.expoConfig?.version ?? '?'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.xl,
    paddingBottom: 34,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: font.h2, fontWeight: '700' },
  spacer: { flex: 1 },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: font.tiny,
    fontFamily: mono,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  tabs: {
    flexDirection: 'row',
    gap: space.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  tabActive: {
    borderColor: 'rgba(94,177,255,0.55)',
    backgroundColor: 'rgba(94,177,255,0.12)',
  },
  tabLabel: { color: colors.textDim, fontSize: font.meta, fontFamily: mono },
  tabLabelActive: { color: colors.accent },
  description: {
    color: colors.textBody,
    fontSize: font.small,
    fontFamily: mono,
    marginTop: space.md,
    lineHeight: 18,
  },
  modelReady: { color: colors.stat, fontSize: font.small, fontFamily: mono, marginTop: space.sm },
  modelError: { color: colors.error, fontSize: font.small, fontFamily: mono, marginTop: space.sm },
  progressBlock: { marginTop: space.sm, gap: 6 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  progressText: { color: colors.textDim, fontSize: font.tiny, fontFamily: mono },
  downloadWarning: { color: '#e0b34d', fontSize: font.tiny, fontFamily: mono },
  keyWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(224,179,77,0.45)',
    backgroundColor: 'rgba(224,179,77,0.10)',
  },
  keyWarningText: {
    flex: 1,
    color: '#e0b34d',
    fontSize: font.tiny,
    fontFamily: mono,
    lineHeight: 16,
  },
  fallbackNote: {
    color: colors.textFaint,
    fontSize: font.tiny,
    fontFamily: mono,
    marginTop: space.lg,
  },
  version: {
    color: colors.textFaint,
    fontSize: font.tiny,
    fontFamily: mono,
    marginTop: space.xl,
    textAlign: 'center',
  },
});
