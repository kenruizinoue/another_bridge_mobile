# another_bridge_mobile: project plan

## Next up (order agreed with Ken, 2026-11-08)

1. Ticket 33: the bridge over Tailscale (with bridge ticket 31). Starts
   when Ken has Tailscale on the Mac and the iPhone.
2. Keys out of the app: ticket 3 (Connect screen, key in the Keychain) and
   ticket 4 (OpenAI through the bridge, bridge ticket 14). Checked
   2026-11-07: the built app holds both the phone key and the OpenAI key
   as plain text.
3. Ticket 28: Face ID lock.
4. The rest of the security, UI and code health tickets.
5. Later: a private web chat served by the bridge could replace this app
   (bridge `docs/ANOTHERTASK_LINK_IDEA.txt`, phase D).

The sections below started as the v1.4.0 security, UI and quality pass
(2026-10-23) and grew with every phase since.

## Goal

Keep the app a thin, pleasant client for another_bridge, with no secrets in
the bundle. After this pass:

- No key ships inside the app. The bridge URL and key are entered once on a
  Connect screen and kept in the iPhone Keychain. OpenAI calls go through the
  bridge, so the OpenAI key stays on the Mac.
- Only secure connections are allowed, streams never get stuck, and
  hands-free mode is hard to start by accident.
- Claude's replies read well: tables, code blocks, quotes and links render
  properly, tool steps are folded, and the app is dark from launch to
  keyboard.
- Every screen has loading, empty and error states with a way to retry, and
  every icon button has a VoiceOver label.

## Decisions (confirmed by Ken, 2026-10-23)

1. Keep ngrok for now. Tailscale is optional, for later.
   (Replaced by decision 12 on 2026-11-07.)
2. Connect screen, key and URL in the Keychain, then the key is rotated.
3. The phone gets its own key, separate from AnotherAgent's (server side).
4. AnotherAgent routes off by default (server side).
5. Resumes only run inside the home folder (server side).
6. Barge-in off by default, long press to start hands-free mode.
7. New E2E flows are planned but only built after Ken approves. The existing
   Detox suite keeps running as is.
8. No changes to the AnotherAgent repos.
9. Worth adding on top (Ken: "improve the things worth adding"): session
   search, folded tool steps, message times with a jump-to-latest button, and
   speed on long chats.
10. Files from the phone (Ken, 2026-10-24: "add a new ui button like
    folders besides the refresh button so we can see the specified
    folder"). A folder button beside refresh opens the folders the bridge
    shares, read only, starting with `~/agent_outputs`. The bridge decides
    which folders are shared, so the app never holds a Mac path and a new
    folder needs no app change. The phone got its own key the same day;
    the Connect screen (ticket 3) still replaces the baked-in key later.
11. Phone sync (Ken, 2026-10-26: "i get this when going outside the chat
    after asking a thing ... audit how the mac syncing is ... to improve
    this experience"). Coming back to a running turn shows it streaming
    live instead of "reconnecting" with 30 s polls.

12. Tailscale instead of ngrok (Ken, 2026-11-07): the app talks to the
    bridge at its private ts.net address (ticket 33).
13. Face ID lock design (Ken, 2026-11-08: "each time i open the app it asks
    for my face id (possible to turn off from config)"): see ticket 28.

## Contract with the bridge (v0.4.0)

- Auth header stays `X-Coder-Key`, with the phone key as its value.
- Errors: HTTP error bodies are `{"detail": "<safe message>", "code":
  "<snake_case>"}`. SSE `error` events carry `{"message": "...", "code":
  "..."}`. A busy session on the stream route returns HTTP 409 before the
  stream starts.
- `POST /transcribe` with JSON `{"audio": "<base64>", "mime_type":
  "audio/m4a", "language": "en"}` returns `{"text": "..."}`. 25 MB audio cap.
  503 when the bridge has no OpenAI key.
- `POST /tts` gains `"engine": "kokoro" | "openai"` (default `kokoro`). The
  OpenAI engine returns `audio/mpeg`.
- Too many requests return 429; oversize bodies return 413.
- Files: `GET /files/roots`, `/files/list?root&path`, `/files/raw?root&path`
  (Range support) and `/files/locate?path`, all with the phone key. See the
  bridge plan, ticket 19, for the shapes. Errors are 403 `not_shared` and
  404 `not_found`.
- Re-attach: `GET /sessions/{id}/resume/attach` streams the rest of a
  running turn (`text`, `tool`, `done`) after the phone fetched
  `/messages`. See the bridge plan, ticket 20. A 404 (an older bridge)
  falls back to polling.
- Terminal copies (bridge ticket 21): `terminal` on cards and on
  `/resume/status`, `held` on `/resume/status`, a `queued` SSE event on a
  held send, and `POST /sessions/{id}/resume/queue/release` for Send
  anyway. Older bridges leave the fields out, and the app treats that as no
  terminal and no hold.

## Status

| Ticket | Name | Status |
|---|---|---|
| 1 | CI hygiene and ESLint | Todo |
| 2 | Domain gateways and adapters | Todo |
| 3 | Connect screen, Keychain, HTTPS only | Todo |
| 4 | OpenAI through the bridge | Todo |
| 5 | Voice safety | Todo |
| 6 | Streams that never get stuck | Done (2026-10-26) |
| 7 | Hardening: downloads, audio files, errors, attachments | Todo |
| 8 | Phase 1 audit | Todo |
| 9 | Markdown tables | Todo |
| 10 | Code blocks, quotes, nested styles, links | Todo |
| 11 | Settings sheet that always closes | Todo |
| 12 | Shared loading, empty and error states with Retry | Todo |
| 13 | Dark from launch to keyboard | Todo |
| 14 | Contrast, text sizes, theme tokens | Todo |
| 15 | VoiceOver labels | Todo |
| 16 | Folded tool steps | Todo |
| 17 | Session list: search, cleaner cards, live dot | Todo |
| 18 | Chat polish: your turns, times, jump to latest | Todo |
| 19 | Speed on long chats | Todo |
| 20 | Phase 2 audit | Todo |
| 21 | Logic out of screens and the settings sheet | Todo |
| 22 | Dependency hygiene | Todo |
| 23 | Final audit and release notes | Todo |
| 24 | Files view | Done (2026-10-24) |
| 25 | Terminal tabs, held messages, Send anyway | Done (2026-10-27) |
| 26 | PDF viewer in Files | Done (2026-10-27) |
| 27 | New session from the phone, Open on Mac | Done (2026-11-05) |
| 28 | Face ID lock mode | Todo |
| 29 | Talk to a running turn, queue actions | Done (2026-11-05) |
| 30 | Delete a session, long-press actions | Done (2026-11-05) |
| 31 | What runs on the Mac | Done (2026-11-05) |
| 32 | Stop a session wherever it runs | Done (2026-11-05) |
| 33 | Bridge over Tailscale | Todo |

## Phase 1: no secrets, safe by default

### Ticket 1 - CI hygiene and ESLint

Objective:

- Lint runs locally and in CI, and the workflow follows the hygiene rules.

TDD work:

- No product code. Add `eslint-config-expo`, an ESLint config and a `lint`
  script; fix what it reports.

Edge cases:

- Generated folders (`ios/`, `coverage/`) are not linted.

Acceptance criteria:

- `.github/workflows/test.yml` has `permissions: contents: read`, a
  concurrency group with cancel-in-progress, `timeout-minutes`, npm caching,
  and runs lint, `tsc --noEmit` and jest on push and PR to `master`.
- `npm run lint`, `npm run typecheck` and `npm test` pass.

### Ticket 2 - Domain gateways and adapters

Objective:

- Screens and hooks talk to interfaces, not to `fetch`.

TDD work:

- Add `src/lib/domain` (types, a `BridgeGateway` and a `KeyStore`
  interface) and move `src/api` into `src/lib/adapters` as the HTTP
  implementation. Hook tests inject a fake gateway. The existing tests are
  the safety net; add tests for the fake injection path.

Edge cases:

- The OpenAI and TTS calls that bypassed the client go through the gateway
  too.

Acceptance criteria:

- No `fetch` or `XMLHttpRequest` outside `src/lib/adapters`. All tests pass.

### Ticket 3 - Connect screen, Keychain, HTTPS only

Objective:

- The URL and key are entered once and stored in the Keychain; nothing
  secret is in the bundle.

TDD work:

- Failing tests: with an empty store the app opens on the Connect screen;
  a valid URL and key are checked against `/auth/verify`, saved with
  `expo-secure-store` (when unlocked, this device only), and the session list
  opens; an `http://` URL is rejected unless the host is `localhost`,
  `127.0.0.1`, a `100.x` Tailscale address or ends in `.ts.net`; a wrong key
  shows a clear message; Settings has "Change connection" and "Forget".
  Pure URL rules live in `src/lib/utils` with unit tests.
- Then remove `EXPO_PUBLIC_BRIDGE_URL` and `EXPO_PUBLIC_CODER_KEY` from the
  code and `.env.example`.

Edge cases:

- Pasted values with spaces or a trailing slash. Key paste from Universal
  Clipboard. Keychain read failure.

Acceptance criteria:

- `expo export` output contains no key and no bridge URL (checked by a test
  script in CI on a dummy `.env`).

### Ticket 4 - OpenAI through the bridge

Objective:

- The OpenAI engines keep working with no OpenAI key on the phone.

TDD work:

- Failing tests with a fake gateway: OpenAI transcription posts base64 audio
  to `/transcribe` and returns its text; OpenAI speech posts to `/tts` with
  `engine: "openai"`; a 503 shows "OpenAI is not set up on the bridge" and
  falls back to the next engine.
- Then remove `EXPO_PUBLIC_OPENAI_API_KEY` from the code and `.env.example`.

Edge cases:

- Recordings over the 25 MB cap are refused before upload.

Acceptance criteria:

- No direct call to `api.openai.com` remains in the app.

### Ticket 5 - Voice safety

Objective:

- Hands-free mode never starts by accident and never hears itself.

TDD work:

- Failing tests: barge-in defaults to off; hands-free starts only on a long
  press, is disabled while the chat is loading, and has a look distinct from
  the mic.
- Then the code; fix the comment that disagreed with the default.

Edge cases:

- A user who had turned barge-in on keeps that choice.

Acceptance criteria:

- The CHANGELOG states the defaults.

### Ticket 6 - Streams that never get stuck

Objective:

- A dropped stream or a failed poll always recovers.

TDD work:

- Failing tests with fake timers: leaving the chat aborts the stream and
  stops polling; a stream with no data for 60 s switches to catch-up; a failed
  poll retries with backoff instead of stopping; refresh during a turn
  restarts catch-up; catch-up keeps older loaded pages; `loadOlder` can never
  append the same page twice.
- Added with Ken's sync audit (2026-10-26): a running turn is followed live
  through `/resume/attach` (bridge ticket 20) instead of polled; a stream
  that drops after the bridge answered is an interruption, never a failed
  send that hands the message back; coming back to the foreground drops a
  text send's frozen stream and attaches fresh; the bar says "claude is
  working on the Mac" while the Mac works and "reconnecting" only when the
  bridge can't be reached.
- Then the code.

Edge cases:

- App backgrounded mid-turn, then resumed after the turn finished.

Acceptance criteria:

- No "syncing" state lasts after the bridge reports the turn as done.

### Ticket 7 - Hardening: downloads, audio files, errors, attachments

Objective:

- Small leaks and weak spots closed.

TDD work:

- Failing tests: model downloads go to a `.part` file, are checked by size
  and SHA-256 from a pinned URL, then moved, and are excluded from backup;
  recordings and reply audio are deleted after use; error messages never show
  the bridge URL; the bridge's `code` and `detail` are shown when present;
  session ids are URL-encoded; the SSE parser (now a pure util) handles CRLF
  and reports bad frames; attachments have a 40 MB total cap.
- Then the code.

Edge cases:

- A download interrupted halfway, then retried.

Acceptance criteria:

- All tests pass.

### Ticket 8 - Phase 1 audit

Objective:

- Close phase 1.

TDD work:

- List the inputs, states and error paths tickets 1 to 7 left untested, add
  tests for the real gaps, fix what they expose.

Edge cases:

- First launch with no network.

Acceptance criteria:

- All checks green locally and in CI.

## Phase 2: UI

### Ticket 9 - Markdown tables

Objective:

- Tables in replies render as tables.

TDD work:

- Failing parser tests: `|` rows with a separator line become a table block
  with header and cells; alignment colons are respected; a lone `|` in a
  sentence stays text. Then a monospace grid component in a horizontal
  ScrollView.

Edge cases:

- Uneven column counts, inline code and bold inside cells, very wide tables.

Acceptance criteria:

- The tables from the audit screenshots render correctly on device.

### Ticket 10 - Code blocks, quotes, nested styles, links

Objective:

- The rest of Claude's markdown renders correctly.

TDD work:

- Failing parser tests: code blocks keep indentation and scroll sideways
  instead of wrapping; `>` quotes become quote blocks; code inside bold
  renders as code; `[text](url)` and bare URLs become tappable links opened
  with the system browser. Then the renderer.

Edge cases:

- Unclosed code fences while a reply is still streaming.

Acceptance criteria:

- Long-press on a code block copies it.

### Ticket 11 - Settings sheet that always closes

Objective:

- The settings sheet can always be scrolled and closed.

TDD work:

- Failing tests: the backdrop and a swipe down close it; content scrolls;
  safe-area insets are used instead of fixed padding.
- Then the change (a native page sheet, or a capped ScrollView with a
  tappable backdrop).

Edge cases:

- The largest accessibility text size with Neural voices expanded.

Acceptance criteria:

- No setting is out of reach at any text size.

### Ticket 12 - Shared loading, empty and error states with Retry

Objective:

- One set of state components used by every async screen.

TDD work:

- Failing tests: list and chat errors show a Retry button that reloads and
  clears the error; an empty session shows an empty state; the list error no
  longer promises a pull-to-refresh it lacks (or gets one).
- Then shared components replace the copy-pasted blocks.

Edge cases:

- Retry while a retry is already running.

Acceptance criteria:

- No duplicated loading or error markup remains.

### Ticket 13 - Dark from launch to keyboard

Objective:

- No light system UI on a dark app.

TDD work:

- Snapshot-free tests where possible: the composer sets
  `keyboardAppearance="dark"`; config tests check `userInterfaceStyle` is
  dark and the splash color matches the theme.

Edge cases:

- The + attach menu and system alerts.

Acceptance criteria:

- No white flash on launch, checked on device.

### Ticket 14 - Contrast, text sizes, theme tokens

Objective:

- Readable text and one source for colors.

TDD work:

- A unit test checks the contrast ratio of each text color against its
  background is at least 4.5:1. Move all hex and rgba values into
  `theme.ts`, raise the smallest text to 12 pt, keep the list header on one
  line that shrinks to fit, let card details wrap.

Edge cases:

- Accessibility text sizes on the list header.

Acceptance criteria:

- No color literal outside `theme.ts`.

### Ticket 15 - VoiceOver labels

Objective:

- Every control is usable with VoiceOver.

TDD work:

- Failing tests: icon buttons require an `accessibilityLabel` (type level and
  test level); tabs announce their selected state; tap targets are at least
  44 pt.

Edge cases:

- Buttons whose label changes with state (mic recording, send while busy).

Acceptance criteria:

- Every button in the audit list has a label.

### Ticket 16 - Folded tool steps

Objective:

- Runs of tool steps take one quiet row.

TDD work:

- Failing tests: consecutive tool steps fold into one row such as "9 steps"
  with the totals, which expands on tap; a single step shows as is.

Edge cases:

- A turn that is only tool steps. Steps arriving while streaming.

Acceptance criteria:

- The audit's noisy transcripts show one row per run of steps.

### Ticket 17 - Session list: search, cleaner cards, live dot

Objective:

- Finding a session is fast.

TDD work:

- Failing tests: a search field filters by title and project through the
  bridge's `q` parameter with a short debounce; an empty result shows an
  empty state; the folder line is hidden when it is the home folder; sessions
  active in the last few minutes show a live dot.

Edge cases:

- Search while offline; clearing the search restores the list position.

Acceptance criteria:

- About twice as many cards fit on screen as before.

### Ticket 18 - Chat polish: your turns, times, jump to latest

Objective:

- Long transcripts are easy to scan.

TDD work:

- Failing tests: your turns have a tinted left edge; repeated "claude" labels
  merge; turns show their time; a jump-to-latest button appears when
  scrolled up, not only while streaming; the title wraps to two lines;
  dragging the transcript dismisses the keyboard; the header count matches
  the list.

Edge cases:

- Turns without timestamps in old transcripts.

Acceptance criteria:

- Checked on device against the audit screenshots.

### Ticket 19 - Speed on long chats

Objective:

- Streaming stays smooth in long transcripts.

TDD work:

- Failing tests: rows and markdown are memoized so a new chunk re-renders only
  the streaming turn (render counter in the test); parsed markdown is cached
  per message.

Edge cases:

- A 7,000-message session.

Acceptance criteria:

- No visible stutter while a reply streams in the largest session.

### Ticket 20 - Phase 2 audit

Objective:

- Close phase 2.

TDD work:

- List what tickets 9 to 19 left untested, add the tests, fix what they
  expose. Re-take the audit screenshots and compare.

Edge cases:

- Largest text size on every screen.

Acceptance criteria:

- All checks green; Ken reviews on his iPhone.

## Phase 3: code health

### Ticket 21 - Logic out of screens and the settings sheet

Objective:

- Screens and the settings sheet only compose hooks and components.

TDD work:

- Move the session list loading into a `useSessions` hook and the settings
  work into a `useSettings` hook, with hook tests on fake gateways. Move
  `prettySize` and similar helpers into `src/lib/utils` with tests.

Edge cases:

- None new; behavior stays the same.

Acceptance criteria:

- `SettingsSheet.tsx` under 250 lines; no data loading in screens.

### Ticket 22 - Dependency hygiene

Objective:

- Dependencies are declared and current within SDK 57.

TDD work:

- Declare `expo-asset` and `expo-constants` as runtime dependencies, apply
  `npx expo install --check` patch updates, and strip the dev tools the
  sherpa TTS package lists as runtime dependencies with npm `overrides`
  where safe. Full suite plus a device build after.

Edge cases:

- The neural voice engine still works on device.

Acceptance criteria:

- `npm audit --omit=dev` critical count drops, or each remaining one is
  explained in the CHANGELOG.

### Ticket 23 - Final audit and release notes

Objective:

- Ready for Ken's review and a PR into `master`.

TDD work:

- Run everything (lint, typecheck, jest, Detox if available), review against
  the standards, fix or list what a reviewer could flag. Bump to 1.4.0,
  update README and CHANGELOG.

Edge cases:

- An install of the old build still works until the key is rotated.

Acceptance criteria:

- All checks green; app installed on Ken's iPhone and connected with the new
  key.

## Phase 4: files from the phone

### Ticket 24 - Files view

Objective:

- See, play, save and share the files the bridge shares, from a folder
  button beside refresh in the chat header (and in the list header), and by
  tapping a file path in Claude's replies.

TDD work:

- Failing tests: the hook opens the only root at once and shows a roots
  list when there are several; back closes the viewer, then goes up a
  folder, then to the roots list, then closes; a tapped chat path opens in
  the viewer or explains it is not shared; listing errors offer Retry; the
  viewer plays video, previews text and copies it, refuses to download
  big text, and reports share errors; paths in replies become links only
  when a handler is given.
- Then `api/files.ts`, `hooks/useFileBrowser.ts`, `FilesScreen`,
  `FileRow`, `FileViewer`, `lib/filePaths.ts` and
  `lib/files/fileActions.ts` (the only file touching native modules).

Edge cases:

- Auth goes in headers for images, video and downloads, never in a URL.
- Text over 1 MB is not previewed; Share still works.
- Saving to Photos asks for add-only access.

Acceptance criteria:

- New native modules: expo-video, expo-media-library, expo-sharing,
  expo-clipboard, mocked at the boundary in `jest.setup.js`.
- Checked by hand once on the iPhone: a reel plays, its cover shows, Save
  to Photos works, and the caption copies.

### Ticket 26 - PDF viewer in Files

Objective:

- PDFs open in place in the Files view (Ken, 2026-10-27: "i want pdf
  viewer for the files feature"), not only through Share.

TDD work:

- Failing tests: a PDF downloads to the cache and shows from the local
  copy; a failed download shows why and retries; a web view error offers
  Retry; a PDF over 100 MB is not downloaded; Share still works; other
  files still offer Share only.
- Then `PdfPane` in `FileViewer`, using the existing cached download.

Edge cases:

- The key goes in the download's headers, never in a URL, and the web
  view may load only the local `file://` copy.

Acceptance criteria:

- react-native-webview added with `npx expo install`; the link check shows
  0 missing; 313 tests pass. Version 1.7.0.

## Phase 5: one copy of a session

### Ticket 25 - Terminal tabs, held messages, Send anyway

Objective:

- Never start a second copy of a session that is working in a terminal tab
  on the Mac (2026-10-27, Ken: "it got duplicated agents"). Show that the
  tab is working, so Ken doesn't need to ask "still waiting?", keep its
  replies coming in, and offer Send anyway.

TDD work:

- Failing tests: opening a session whose terminal tab works keeps polling
  its transcript and stops when the tab is done; a send while it works goes
  to the bridge's queue, never a stream; a `queued` event moves the message
  from the chat to the queue with its reason; Send anyway calls the release
  endpoint and syncs again, and shows its error; the status bar says why a
  queue waits and offers Send anyway only then; the bar and the session
  card show "working in the Mac terminal" with running agents.
- Then the code in `api/sessions.ts`, `useChatSession`, `ChatStatusBar`,
  `SessionCard` and `ChatScreen`.

Edge cases:

- An older bridge sends no `terminal` or `held`: nothing changes.
- A tab that is open but quiet shows nothing, and a send streams as usual.

Acceptance criteria:

- 308 tests pass and the typecheck is clean. Version 1.6.0. Installed only
  when Ken says so, together with the bridge restart.

## Phase 6: sessions between the phone and the Mac

### Ticket 27 - New session from the phone, Open on Mac

Objective:

- Ken starts a session from the phone and continues it on the Mac, and
  opens any session in a new Mac terminal tab from the phone (bridge
  ticket 25).

TDD work:

- `src/lib/macSessions.ts`: the message for each Open on Mac result and
  the card for a session the phone just started.
- `useNewSession`: starts `/sessions/new/stream`, hands a card over on the
  `session` event and closes the stream (the first turn keeps running and
  the chat attaches to it), shows errors and gives the message back, one
  start at a time, closes on unmount.
- `useOpenOnMac`: calls `/open-on-mac` and says what happened in an alert.
- Screens: the + menu (New session, Resume on Mac), the pick banner and
  Cancel, the chat header button, the new-session form.

Edge cases:

- A tap while a phone turn runs answers `waiting`; the tab opens when the
  turn ends.
- The first tap may need macOS to allow the bridge to control iTerm; the
  alert shows osascript's message until then.

Acceptance criteria:

- 341 tests pass and `tsc` is clean. 1.8.0 installed 2026-11-05; 1.8.1
  the same day reworked the New session screen into a top-aligned form
  (the composer floated to mid-screen with the keyboard) and split the
  list header into a toolbar row and a large title.

### Ticket 28 - Face ID lock mode

Objective:

- Design agreed with Ken on 2026-11-08: the app asks for Face ID when it
  opens, and again when it comes back after 5 minutes or more away (a
  quick app switch doesn't ask). The iPhone passcode is the fallback.
- On by default, with a switch in Settings. Turning it off asks for Face
  ID first, so someone holding the unlocked phone can't switch it off.
- The app switcher shows a blank screen instead of the chats.

TDD work:

- `expo-local-authentication` at the SDK 57 version (`npx expo install
  --check`, then `scripts/ios_link_check.py`), `NSFaceIDUsageDescription`
  in app.json, the lock state in a hook with the module mocked in tests:
  locked at launch, unlocked after success, locked again after 5 minutes
  in the background, not after 1 minute, the switch needs Face ID to go
  off, a failed or cancelled check stays locked.

Edge cases:

- No paid Apple account or entitlement is needed; it is a native module,
  so it needs a rebuild and a new version.
- It protects the screens, not the key built into the app (ticket 3 does).
- A phone without Face ID or passcode set up: show why and stay usable.

Acceptance criteria:

- Order: after ticket 33 and tickets 3 and 4 (see "Next up").

### Ticket 29 - Talk to a running turn, queue actions

Objective:

- Two ways to send while Claude works, Now (into the running turn) and
  After this turn (the queue), plus Stop and Send now, Delete, Edit for
  queued messages (bridge ticket 26).

TDD work:

- `useChatSession`: "now" calls `/resume/inject` and shows the message
  as sent; a refused inject falls back to the queue with a notice;
  "after" always queues; `mergeSteers`; stop, send now, delete and undo,
  edit; a failed action keeps its error after the re-sync (a catch-up
  used to clear it at once).
- `Composer`: the switch only while busy with something typed, Now off
  with its reason, the clock icon for After, Stop while empty.
- `QueueTray`: Send now, Delete, long-press Edit, Send all now from two,
  the paused bar with Run queue, Undo, the sent-message states.

Acceptance criteria:

- 359 tests pass and `tsc` is clean. Installed as 1.9.0.

### Ticket 30 - Delete a session, long-press actions

Objective:

- Long-press a card for Open on Mac and Delete session (bridge ticket
  28), with two checks before anything is deleted.

TDD work:

- `isDeleteConfirmed`: DELETE in any case, trimmed; nothing else.
- The list: long-press shows the actions with Delete as destructive;
  the warning, then typing DELETE, calls the bridge and removes the
  card; a wrong word deletes nothing and says so.

Acceptance criteria:

- 363 tests pass and `tsc` is clean. Installed as 1.10.0.

### Ticket 31 - What runs on the Mac

Objective:

- A full-screen "On the Mac" view from the list toolbar with the running
  Bash commands per session (Stop asks first) and every open Claude
  process (bridge ticket 29).

TDD work:

- `formatDuration`; the screen lists commands with their meta and the
  Claude processes, says when nothing runs, stops only after the
  confirmation, and refreshes every 3 s while open.

Acceptance criteria:

- 368 tests pass and `tsc` is clean. Installed as 1.11.0.

### Ticket 32 - Stop a session wherever it runs

Objective:

- A Stop per working session in "On the Mac" (its turn, or its turn and
  all its commands), and the chat's Stop for a session working in a Mac
  tab (bridge ticket 30).

TDD work:

- The view's Stop offers both choices and reports what stopped
  (`describeStop`); a working session without commands still shows;
  the chat hook calls the session stop when a Mac tab works and the
  phone turn stop otherwise.

Acceptance criteria:

- 372 tests pass and `tsc` is clean. Installed as 1.12.0.

### Ticket 33 - Bridge over Tailscale

Status: Todo (created 2026-11-07).

Objective:

- The app reaches the bridge at its tailnet address (bridge ticket 31),
  so only Ken's own devices can talk to the Mac.

Work:

- `EXPO_PUBLIC_BRIDGE_URL` in `.env.local` becomes
  `https://<mac>.<tailnet>.ts.net`.
- The Connect help and the offline message say Tailscale must be on.

Acceptance criteria:

- Works on cellular with Tailscale on, shows offline with it off.
- Installed with a new minor version.

## Optional, not scheduled

- QR code pairing from the Mac.
- New E2E flows, only after Ken approves.

## Verification commands

```bash
npm install
npm run lint
npm run typecheck
npm test
npx expo run:ios --device <udid> --configuration Release
```
