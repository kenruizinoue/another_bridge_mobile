# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.7.1] - 2026-10-27

### Added

- Unsent text in the composer is saved per session on the phone, so
  leaving the chat, closing the app or installing a new build keeps it.
  Sending clears it. Each session has its own draft.

### Changed

- The chat title has its own row at the top, up to 2 lines. The back,
  refresh and Files buttons sit on the row below it, with the folder and
  message count between them.

### Fixed

- Chats Ken had just used in a terminal tab (even a /compact or
  /sync-mobile) showed the queue for 2 minutes after that turn ended, so
  the queue seemed to follow him from chat to chat. The bridge now holds a
  finished terminal turn's session for 20 seconds, not 120. Needs the
  matching another_bridge change.

## [1.7.0] - 2026-10-27

### Added

- PDFs open in the Files view instead of only through Share: the app
  downloads the file (key in headers, never in a URL) and iOS shows it,
  with scrolling and pinch to zoom. Retry on a failed download, and PDFs
  over 100 MB still go through Share. New native module:
  react-native-webview 13.16.1.

### Changed

- A message held by the bridge's turn cap names the sessions it waits
  for ("1 queued, waiting for AnotherSystems Marketing to finish…")
  instead of "other phone turns are running", which read as if nothing
  was there. The bridge's cap went from 2 to 3 at the same time.

## [1.6.0] - 2026-10-27

### Added

- A session that is working in a terminal tab on the Mac says so, in the
  chat ("working in the Mac terminal, 2 agents running") and on its card
  in the list. The chat keeps pulling the tab's replies while it works.
- A message sent while that tab works waits in the bridge's queue ("1
  queued until the Mac terminal is done"), instead of starting a second
  copy of the session that would redo the same work. The same happens when
  2 phone turns already run ("other phone turns are running").
- Send anyway, next to that line, runs the held messages now.
- Needs another_bridge with ticket 21; an older bridge behaves as before.

## [1.5.2] - 2026-10-26

### Fixed

- "Couldn't load" on the conversations screen said "Pull down to retry"
  but sat on a plain view, so nothing could be pulled and only killing the
  app recovered it (seen when the ngrok tunnel was down). The error now
  sits on a pullable view with a Retry button, retries by itself when the
  app comes back to the foreground, and stays up until a retry succeeds
  instead of flashing an empty list. An empty list can be pulled too.

## [1.5.1] - 2026-10-26

### Changed

- Same code as 1.5.0. Rebuilt under a new version, because from now on
  every install on the phone gets one, so the header shows the update.
  `package-lock.json` now carries the app version too (it said 1.4.0).

## [1.5.0] - 2026-10-26

### Added

- Leaving a chat mid-turn and coming back (or reopening the app) shows
  the reply streaming in live again, through the bridge's new
  `/resume/attach`. Before, the chat showed "reconnecting, syncing from
  the Mac" and only pulled the transcript every 30 s. Needs another_bridge
  with `/resume/attach`; an older bridge falls back to polling.

### Changed

- The bar reads "claude is working on the Mac" while the Mac works.
  "Reconnecting to the Mac" now only shows when the bridge can't be
  reached.
- Refresh during a turn re-syncs and attaches again, and keeps the older
  pages you scrolled up to.

### Fixed

- A failed catch-up (offline, ngrok reconnecting) stopped retrying, so the
  bar could spin forever. It now retries with backoff.
- A stream that dropped after the bridge accepted the message (iOS froze
  the app) was treated as a failed send: the message went back into the
  composer while the Mac kept working on it.
- Coming back to the app with a frozen stream now drops it and attaches
  fresh; a stream silent for 60 s is treated as dropped.
- Leaving the chat now closes its stream and stops its polling (before,
  a catch-up in flight kept polling after the chat closed).
- `loadOlder` can no longer append the same page twice.

## [1.4.0] - 2026-10-24

### Added

- Files view. A folder button beside refresh in the chat header (and in
  the conversations header) opens the folders the bridge shares, newest
  first, with cover thumbnails. Videos play, images and text show in
  place, and every file has Share; videos and images also have Save to
  Photos, and text has Copy (for post captions). Needs another_bridge with
  `ANOTHER_BRIDGE_FILE_ROOTS` set.
- File paths in Claude's replies are tappable and open in the Files view
  when the folder is shared.
- VoiceOver labels on the header buttons.

### Changed

- The app now uses its own phone key (`ANOTHER_BRIDGE_PHONE_KEY` on the
  bridge). Builds with the old shared key get 401 on the phone routes.
- Expo SDK 57 packages moved to the patch versions the SDK expects (expo
  57.0.31, react-native 0.86.3, jest-expo 57.0.6 and the other expo
  modules).

### Fixed

- The first 1.4.0 build crashed at launch: expo-media-library 57.0.5
  needs a newer expo-modules-core than expo 57.0.1 shipped ("Symbol not
  found ... BaseModule willDestroy").
- The second crashed too: a fresh install hoisted expo-font 58 (SDK 58)
  as the peer of `@expo/vector-icons`. `expo-font` is now a direct
  dependency at ~57.0.4. `scripts/ios_link_check.py <app>` checks that
  every symbol a bundled framework imports exists before installing.
- The Files header sat under the status bar (clock and battery over the
  back and close buttons): SafeAreaView gets no insets inside a Modal, so
  the screen now pads itself with the app's safe area insets.
- Save to Photos retries once when Photos answers "operation interrupted"
  (PHPhotosErrorDomain 3301, seen on iOS 27.0.1 with a valid H.264 reel),
  then says to use Share, then Save Video, instead of the raw error.

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
