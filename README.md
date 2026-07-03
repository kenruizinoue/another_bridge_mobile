# another_bridge_mobile

A terminal-styled iOS client (Expo / React Native) for [another_bridge](https://github.com/kenruizinoue/another_bridge). Browse the Claude Code sessions on your Mac from your phone, read any conversation, and continue it: your message runs `claude --resume` on the Mac and the reply streams back token by token, with image and file attachments supported.

Attachments work two ways: images are sent inline so Claude sees them, while files (PDF, txt, csv, md, json, code) are saved on the Mac and Claude reads them with its own Read tool. That means a 15MB CSV never inflates the prompt, and the file stays available for follow-up turns. Requires another_bridge 0.2.0 or newer.

Built for one person and one Mac. No accounts, no backend of its own. The only server is the bridge you run yourself.

## How it works

The app is a thin client over the bridge's session API (all requests authenticated with the `X-Coder-Key` header):

- `GET /sessions` lists session cards (title, project, message count)
- `GET /sessions/{id}/messages` pages through a transcript, newest first
- `POST /sessions/{id}/resume/stream` continues a session, streaming the reply as SSE
- `POST /sessions/{id}/resume/queue` queues a message server-side while a turn is already running
- `GET /sessions/{id}/resume/status` tells a reconnecting client whether a turn is still running

The Mac's transcript is the source of truth. If the stream drops (phone locked, network change, app killed), the app never re-sends: it polls the status endpoint and re-syncs from the transcript until the reply lands.

## Setup

1. Run [another_bridge](https://github.com/kenruizinoue/another_bridge) on your Mac and note its URL and `ANOTHER_CODER_API_KEY`.
2. Clone this repo and install:

   ```bash
   npm install
   ```

3. Configure the environment:

   ```bash
   cp .env.example .env.local
   # set EXPO_PUBLIC_BRIDGE_URL and EXPO_PUBLIC_CODER_KEY
   ```

4. Run it:

   ```bash
   npx expo run:ios                 # iOS simulator (bridge URL: http://localhost:8000)
   npx expo run:ios --device        # a real iPhone (bridge URL: your Mac's LAN or Tailscale IP)
   ```

That's it. The session list should show your Claude Code conversations; tap one to read or continue it.

## Security notes

- `EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time. Anyone with the built app binary can extract the key, so treat it as low-secret: fine for a personal tool on your own phone, not for distribution.
- Off your home network, point `EXPO_PUBLIC_BRIDGE_URL` at an encrypted transport (Tailscale or an ngrok HTTPS tunnel), never plain HTTP over the open internet. The key travels in a header on every request.
- Read the bridge's [threat model](https://github.com/kenruizinoue/another_bridge/blob/main/docs/SECURITY.md) before exposing it beyond localhost.

## Architecture

```
App.tsx                     two screens, one bit of state (no navigation lib)
src/
  api/
    client.ts               fetch wrapper + XHR-based SSE reader, auth header, error mapping
    sessions.ts             typed endpoint wrappers
    types.ts                wire types, mirror the bridge's dataclasses
  hooks/
    useChatSession.ts       conversation state machine: paging, streaming, queue, catch-up
    useAttachments.ts       image picking + downscale/JPEG-compress to base64
  screens/
    SessionListScreen.tsx   the card list
    ChatScreen.tsx          layout + wiring only; logic lives in the hooks
  components/               presentational: Composer, ChatStatusBar, StreamingTurn,
                            TurnRow, Markdown, ToolLines, SessionCard, GlassIconButton
  lib/
    markdown.ts             dependency-free markdown subset parser (pure, testable)
    time.ts                 relative timestamps
  theme.ts                  design tokens (terminal palette, mono font, spacing)
```

Conventions: screens hold no business logic, API calls only happen in `src/api`, and rendering stays dependency-free (the markdown renderer is a small hand-rolled subset, not a library).

## Testing

```bash
npm run typecheck    # tsc --noEmit
npm test             # unit + integration (jest-expo + Testing Library)
```

Unit tests cover the pure layers (markdown parser, relative time, the SSE frame parser, stream event dispatch). Integration tests exercise the real `useChatSession` state machine and both screens with the API module mocked at the seam: live streaming, the busy-queue path, and send rollback.

E2E runs with Detox against a mocked bridge server (`e2e/mockBridge.js`), so no real bridge, Claude, or network is involved:

```bash
brew tap wix/brew && brew install applesimutils   # one-time
npm run e2e:build    # Release simulator build, mock URL baked in
npm run e2e:test     # list → open → send → streamed reply → back
```

Note: Detox 20.x officially supports React Native up to 0.84; this project is on 0.86, where it works but is not officially covered yet.

CI (`.github/workflows/test.yml`) runs typecheck + unit/integration tests on every push and PR.

## License

MIT, see [LICENSE](LICENSE).
