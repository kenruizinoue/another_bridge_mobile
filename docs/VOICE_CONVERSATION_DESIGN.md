# Voice Conversation Mode: Design and Tickets

Goal: a hands-free, turn-based voice conversation with a Claude Code session from the phone. The app listens automatically, detects when I stop speaking, sends the transcript to the session, and speaks a short, code-free version of the reply. I can interrupt the speech and take my turn. Inspired by the VoiceMode plugin experience on the Mac, built on what the app already has.

## Current state (what we build on)

- `useVoiceInput`: tap-to-record dictation with a hard time cap. Stop, transcribe, and hand the text to the composer as a DRAFT. Never auto-sends. Status: idle, recording, transcribing.
- `src/lib/transcription/`: router with three engines (Apple on-device, whisper.rn, OpenAI cloud) and explicit language. `recording.ts` owns capture.
- `useChatSession`: the send path. `resumeSessionStream` streams the reply over SSE into `streamText`, with queueing and catch-up re-sync already solved.
- No text-to-speech anywhere in the app today.

## Target experience (the loop)

1. I toggle Conversation Mode in the chat screen.
2. Mic opens with a subtle chime. I speak. A silence of about 1 second ends my turn.
3. Transcript auto-sends to the session (with a 2 second cancel window showing the text).
4. While the Mac streams the reply, the status bar shows progress as today.
5. When the reply lands, the phone speaks only the short spoken summary, never code.
6. Speech ends, mic reopens automatically. Repeat until I turn the mode off.
7. Tapping the screen while it speaks stops the speech instantly and opens the mic.

State machine: idle, listening, transcribing, sending, streaming, speaking, then back to listening. Pause and stop are reachable from every state.

## Design decisions

### 1. End-of-speech detection (the auto-cut)

Options:
- A. Energy-based silence detection: watch the recorder's metering level (expo-audio exposes it) and stop after N ms below a threshold. Engine-agnostic, keeps the three-engine fallback intact. Tunable silence window in settings.
- B. Apple continuous recognition end-detection: expo-speech-recognition can report final results. Ties conversation mode to one engine.

Decision: A for the MVP. It slots into `recording.ts` and works for every engine. Revisit B only if A proves unreliable (log the measurements either way).

### 2. Auto-send

In conversation mode the final transcript bypasses the composer draft and goes straight to `useChatSession.send`. Guard rails: show the transcript in a toast-like bar with a cancel affordance for about 2 seconds, skip sending empty or blank-audio transcripts, and never auto-send outside conversation mode (the existing dictation flow stays untouched).

### 3. Short, code-free spoken replies

The core problem: agent replies are often big and tool-heavy (file edits, diffs, paths, test output). Guessing what to skip from the client side is fragile; extraction can easily pick a sentence about a diff and speak nonsense. So the model itself must decide what is worth saying out loud.

Options:
- A. Client-side extraction: strip code fences, tool lines, and markdown, speak the first sentences. Fragile on big edit replies, see above.
- B. Speech marker protocol: in conversation mode, append a constant instruction suffix to every outgoing message: end the reply with a one or two sentence spoken summary wrapped in a marker, for example SPEECH: ... on its own final line. The client speaks ONLY the marked part and skips the entire rest of the reply. The full reply still renders on screen as usual.
- C. Bridge-side summarizer: a second model call on the Mac that condenses the reply for speech. Extra latency and cost.

- D. Schema-enforced reply (verified July 2026): the Claude Code CLI supports `--json-schema` with `--output-format json`, returning a validated `structured_output` field that is guaranteed to match a provided schema, for example `{"speech": string, ...}`. The catch: it is NOT compatible with `--output-format stream-json`, so the bridge loses token-by-token streaming for that turn. In conversation mode this is acceptable: the user is listening, not reading, so streaming text has little value; the full reply still lands on screen when the turn completes, and the existing status endpoint covers the wait.

Decision: D is the guaranteed path and the design target. It needs a small bridge extension: the resume request gains a voice flag, and for those turns the bridge runs `--output-format json --json-schema` (speech field required) instead of stream-json, then returns speech alongside the full text. B (marker suffix) is the interim mechanism that works with zero bridge changes, and stays as the fallback if a schema turn fails. In both cases, when no speech text is available the client speaks a canned metadata status line ("done, I edited two files, details on screen"), never raw extraction. A is dropped; C is unnecessary given D. Schema limitations to respect: no minLength or maxLength constraints, so summary brevity is enforced by the schema field description, not by validation.

### 4. Text-to-speech engine

- MVP: expo-speech (the on-device AVSpeechSynthesizer). Free, offline, zero setup, good enough for short summaries.
- Upgrade: the Mac already runs Kokoro with an OpenAI-compatible speech endpoint (port 8880, installed for VoiceMode). Add a bridge route that proxies it and stream higher quality audio to the phone. BYO OpenAI TTS key as a third option, mirroring the transcription settings pattern.

### 5. Interruption

- Phase 1: tap to interrupt. Any tap during speaking stops TTS and jumps to listening. Reliable, ships with the MVP.
- Phase 2: barge-in. Keep the mic open while speaking using the voice-processing audio mode (echo cancellation) and reuse the silence detector inverted: sustained voice energy during playback stops the speech and starts capturing. Risk: the TTS triggering itself through the speaker; needs headphone and speaker testing on device. Record the findings even if negative.
- Out of scope for now: interrupting the running turn on the Mac itself. The bridge has no cancel endpoint; note it as a possible bridge extension.

### 6. Speaking timing

MVP speaks once when the stream ends. Sentence-level incremental TTS during streaming is a later optimization; it fights with the summary-extraction approaches and is only worth it if end-of-stream feels too slow in practice.

### 7. Entry point and settings

Entering the mode: a dedicated third button in the composer, next to the existing mic. The mic keeps its current meaning (dictate into the draft); the new button uses a waveform or frequency icon and toggles conversation mode for that chat. While active, the composer area is replaced by a conversation state pill showing listening, thinking, or speaking, with the same waveform button (now highlighted) to exit. This keeps the two voice features visually distinct and leaves the typed flow untouched.

Settings: conversation mode itself is per-chat via the button, not global. SettingsSheet gains: TTS voice and rate, silence window (0.8 to 2.0 seconds), spoken summary on or off, and later the TTS engine picker.

## Tickets

Phase 1, hands-free MVP (implemented 2026-07-24, all gates green: 199 jest tests across 28 suites, tsc clean):
- V1.1 DONE. Silence detection: pure detector in `src/lib/voice/silenceDetector.ts` fed by metering samples (threshold, silence window, no-speech timeout all configurable), `WAV_16K_MONO_METERED` options in `recording.ts`. 8 unit tests with scripted meter streams.
- V1.2 DONE. Conversation loop: pure state machine in `src/lib/voice/conversationMachine.ts` (every event returns effects, zero React or native access, 11 tests) plus `useVoiceConversation` hook that executes the effects (recorder, meter polling, transcription router, speaker, timers; 8 tests with injected fakes).
- V1.3 DONE. Auto-send with a 2 second cancel window lives in the machine (confirming state) and the pill UI; blank transcripts re-listen instead of sending. Covered by machine and hook tests.
- V1.4 DONE. `src/lib/speech/`: Speaker interface plus expo-speech implementation (`expoSpeaker`), dependency added (`expo-speech ~57.0.1`), manual jest mock, 6 tests.
- V1.5 DONE. `src/lib/voice/speechReply.ts`: `VOICE_MODE_SUFFIX` constant, SPEECH: marker parser (code-fence aware, last-marker-wins), canned metadata status fallback. 8 tests including a big file-edit reply fixture. `src/lib/voice/replyWatcher.ts` decides when to speak (arms on busy, fires once on settle, never speaks a stale turn), 6 tests.
- V1.6 DONE. UI: waveform (`pulse`) button beside the mic in the composer, `ConversationPill` replacing the composer while active (state labels, transcript with Cancel, tap-to-interrupt while speaking, exit), ChatScreen wiring (suffix on voice sends, reply watcher effect). Component, composer, and screen tests added. NOTE: audio chimes were dropped from this ticket; the state pill is the only turn cue for now. Revisit only if the visual cue proves insufficient on device.
- V1.7 DONE (written, not yet executed). Detox flow in `e2e/flows.test.js`: enter conversation mode with mic pre-granted, assert the Listening pill, exit back to the composer. Deliberately scoped to the mode's chrome; real speech through the simulator mic is not deterministic in CI. Needs `npm run e2e:build` then `npm run e2e:test` on a machine with the iOS simulator to execute.

Phase 2, guaranteed speech replies (implemented 2026-07-24, bridge suite 317 pytest green at 81 percent coverage):
- V2.1 DONE (another_bridge repo). `voice: true` on the resume body switches every path (stream, blocking, queue) to `--output-format json --json-schema` with a {reply, speech} schema. The stream variant runs blocking on a worker thread with SSE keepalives, then emits the full reply as one text chunk, a new `speech` event, and `done`. The transcript view unwraps the structured turn so the screen shows the reply, not JSON. 9 tests in tests/test_sessions_voice.py.
- V2.2 DONE (this repo). The api layer sends the voice flag and surfaces the `speech` event; useChatSession exposes `speech`; conversation-mode sends drop the suffix entirely; the reply watcher prefers the schema field and keeps the marker parser plus canned status as fallbacks (covers queued voice turns, where the SSE speech event does not exist).
- V2.3 DONE. Brevity, the no-code rule, and same-language-as-the-user live in the schema field description (the validator supports no length constraints). NOT yet validated against a live claude run end to end; do one real voice turn from the phone before trusting it.

Phase 3, interruption upgrade (implemented 2026-07-24):
- V3.1 SKIPPED as a separate spike per Ken's call (device-and-mic dependent). Its questions are folded into the V3.2 validation note below.
- V3.2 DONE. Machine gains onBargeInSpeech (speaking to listening, stop speech only, the monitor capture becomes the turn). The hook opens a monitor capture before speaking when the setting is on, under a mixWithOthers audio session so recording coexists with playback; the silence detector's speech-start during the speaking state triggers the cut. Setting in SettingsSheet, default OFF. VALIDATION PENDING ON DEVICE: echo behavior on speakers (the reply may trigger itself; headset recommended), threshold tuning, and whether iOS honors mix-mode recording during expo-speech playback. Do not default this on until tested on hardware.

Phase 4, voice quality (implemented 2026-07-24):
- V4.1 DONE (another_bridge repo). POST /tts proxies the local Kokoro OpenAI-compatible speech endpoint (URL, default voice, and timeout configurable via env; 503 when unconfigured or unreachable, 502 on upstream errors, 2000-char cap). 6 tests in tests/test_tts.py.
- V4.2 DONE (this repo). lib/speech grew a preference (device, bridge, openai; default device), a remote-speaker shell (synthesize to a cache file, play via expo-audio, stoppable at both stages), bridge and OpenAI synthesizers, and a speech router that falls back to the device voice whenever a remote engine errors. Picker in SettingsSheet. The conversation hook now speaks through the router. Audio playback itself is device-validation pending (the expo-audio player path has unit tests over fakes only).
- V4.3 DONE. The dictation language flows to every speaker (device voice language, Kokoro per-language voice, OpenAI instruction) and the schema description pins the summary to the user's language.

Phase 5, better voice models (implemented 2026-07-24, ported from another_interviewer):
- Neural TTS engine: on-device Piper voices via react-native-sherpa-onnx-offline-tts with segmented producer/consumer playback, 6-voice catalog (5 English high/medium models plus a Spanish one) downloaded on demand from Hugging Face, espeak-ng-data bundled as an app asset. Engine and voice selectable in settings; falls back to the device voice when the voice is missing or synthesis fails.
- OpenAI STT upgraded to gpt-4o-transcribe (full model). OpenAI TTS stays on gpt-4o-mini-tts (their newest speech model) with the voice now selectable (alloy, nova, coral, onyx, sage, shimmer).
- Bridge resumes disallow the Mac's VoiceMode tools on every mobile-driven turn, so a phone conversation can never speak or listen on the Mac.
- 233 jest tests across 32 suites; neural synthesis and playback verified with fakes only, real audio quality is a device check.

## Open questions

- Does the 2 second cancel window feel safe enough for auto-send, or do we need a per-message confirm setting at first?
- Where should the speech summary instruction live long-term: client suffix (V2.1) or a bridge-side option so other clients benefit?
- Should conversation mode pause automatically when the app backgrounds mid-loop, and what does resume look like (probably reuse the existing catch-up machinery)?

## Risks

- Silence detection tuning across environments (quiet room vs street) is the main UX risk; make the window user-tunable from day one.
- Auto-send transcribing garbage (TV, other people) and sending it to a live session; the cancel window and blank guards are the mitigation, barge-in testing may add more.
- expo-speech voice quality may undersell the feature; Phase 4 exists for exactly that.
