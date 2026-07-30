# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-07-29

### Added

- Voice conversation mode: a waveform button beside the mic starts a
  hands-free, turn-based conversation with the session. The app listens,
  cuts your turn on about a second of silence, auto-sends after a 2
  second cancel window, and speaks the reply, then reopens the mic.
  Tapping while it speaks interrupts instantly. The composer is replaced
  by a state pill (listening / thinking / speaking) while active.
- Energy-based silence detection (`src/lib/voice/silenceDetector.ts`) fed
  by recorder metering, with a tunable silence window, and a pure
  conversation state machine (`conversationMachine.ts`) whose effects the
  `useVoiceConversation` hook executes — no React or native access in the
  logic itself.
- Schema-guaranteed spoken replies: voice turns ask the bridge to run
  claude under a `{reply, speech}` JSON schema, so the model itself
  decides the short, code-free line to speak. A `SPEECH:` marker parser
  and a canned status line remain as fallbacks (queued turns have no SSE
  speech event). Requires another_bridge >= 0.3.0.
- Four text-to-speech backends behind one router with automatic
  fallback to the device voice: on-device Piper neural voices
  (react-native-sherpa-onnx-offline-tts, 6-voice catalog downloaded on
  demand), the Mac's Kokoro server via the bridge's `/tts`, OpenAI
  gpt-4o-mini-tts, and expo-speech.
- Optional barge-in: a monitor capture stays open while speaking so
  talking over the reply cuts it off. Default OFF, device validation
  pending.
- Settings for the TTS engine, voice, silence window, and barge-in. The
  dictation language now flows to every speaker and pins the spoken
  summary to the same language.

### Changed

- OpenAI transcription upgraded to gpt-4o-transcribe.

## [1.2.0] - 2026-07-14

### Added

- Voice input: a mic button next to + dictates into the composer,
  WhatsApp-style. The transcript lands in the text box for review; it is
  never auto-sent.
- Three transcription engines with automatic fallback: Apple on-device
  speech (default, free, offline), on-device Whisper small multilingual
  (one-time 466MB model download), and the OpenAI cloud API via an
  optional EXPO_PUBLIC_OPENAI_API_KEY.
- Language setting (English / Español) passed explicitly to every engine
  so nothing auto-detects (fixes Whisper hearing Spanish as Portuguese).
- Settings sheet, opened from a gear button on the session list header:
  pick the transcription engine (same Apple / Whisper / OpenAI tabs as
  another_interviewer) and the dictation language, watch the Whisper
  model download (with a keep-the-app-open warning), and see the app
  version.
- OpenAI engine tab shows a warning banner when no
  EXPO_PUBLIC_OPENAI_API_KEY is baked into the build.
- Reading while streaming: the chat list anchors your scroll position
  while a reply streams in, and a floating "new reply" pill jumps back
  to the live reply when you're scrolled up in history.

### Changed

- Composer redesigned as a two-row rounded card: the text input gets the
  full top row (smaller mono font, grows to 7 lines before scrolling)
  with the +, mic, and send buttons on the row below.

## [1.1.0] - 2026-07-02

### Added

- File attachments: the composer's + button opens an attach menu (Photo
  Library or Files). PDF, txt, md, csv, json, code files, and other
  text-readable formats are uploaded to the Mac, where Claude reads them
  with its own Read tool. Max 5 files, 20MB each; images keep the
  existing inline pipeline (max 10, compressed).
- File chips in the attachment strip with name, size, and per-chip
  remove.
- The app version is shown in the session list header.
- Requires another_bridge >= 0.2.0 for the files field.

### Changed

- The image-only attach button was replaced by the single + attach menu.

## [1.0.0] - 2026-07-01

### Added

- Initial release: session browser, terminal-styled chat view with
  markdown, streaming resume over SSE, image attachments, server-side
  send queue, reconnection catch-up, 97 Jest tests, Detox E2E against a
  mocked bridge, GitHub Actions CI.
