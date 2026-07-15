# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

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
