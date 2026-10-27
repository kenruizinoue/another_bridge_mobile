# Ken React Native (Expo) Rules

Use with `base-sdlc.md`. Usually paired with a separate backend phase (e.g. `python-fastapi`) when the app needs a server; the mobile app stays a thin client either way.

## Purpose

Build a real usable mobile client while keeping network and domain boundaries swappable, matching the same core-vs-adapter split as the web stack. UI may guard obvious invalid actions; backend/core remains authoritative.

## Structure

```text
app/               # expo-router screens (thin, file-based routing)
components/        # reusable presentational UI
hooks/             # stateful workflow logic
lib/
  domain/          # types and gateway interfaces
  adapters/        # HTTP/storage/native implementations
  utils/           # pure helpers + unit tests
assets/
.maestro/          # E2E flows
```

Styling: NativeWind (Tailwind for React Native) for product apps; `StyleSheet.create` for small tools/prototypes.

## Defaults

- Expo (managed workflow) + TypeScript + expo-router.
- Jest + React Native Testing Library from the first ticket (`jest-expo` preset).
- ESLint via `eslint-config-expo`; runs in CI.
- `@/` path alias to project root in both `tsconfig.json` and babel/metro config.
- Env vars: `EXPO_PUBLIC_`-prefixed, inlined into the bundle at build time. Always static access (`process.env.EXPO_PUBLIC_FOO`); a dynamic `process.env[key]` lookup is NOT inlined and reads back `undefined` in a release build. Commit `.env.example` with empty values; gitignore real env files (`.env.local`).
- Never put a secret key in an `EXPO_PUBLIC_*` var. Anything with that prefix ships inside the built app bundle and is extractable by anyone with the `.ipa`/`.apk` (unzip + inspect the JS bundle). Proxy third-party API calls through a backend, or use a publishable-key-to-session-token exchange when no backend exists. This constraint is absolute for anything distributed beyond your own device; for a local/personal-only build the risk is lower but still worth a conscious call, not a default.
- Scripts: `start` (`expo start`), `test` (`jest`), `test:watch`, `lint`, `typecheck` (`tsc --noEmit`), `e2e` (`maestro test .maestro/`), `build:ios`/`build:android` (`eas build`).

## Boundary Rules

- No direct `fetch` in screens/components.
- Put gateway interfaces in `lib/domain/`.
- Put concrete network/storage adapters in `lib/adapters/`.
- Inject fake gateways in screen/hook tests.
- Keep deterministic client rules in `lib/utils/` with unit tests.
- Business/session state lives in hooks, not screens; screens compose hooks + components.

## Ticket Order

1. Expo setup and smoke render test.
2. Mobile CI workflow: `npm test` + `tsc --noEmit` on push to main.
3. Domain types and gateway interface.
4. API adapter with mocked tests.
5. First usable screen with injected gateway.
6. Workflow hooks.
7. Utility functions and tests.
8. Loading, empty, and error states.
9. Platform polish (safe areas, keyboard handling, iOS/Android parity).
10. E2E ticket (see Testing Rule; add to CI only once approved).

## Component Rules

- Repeated UI must be one shared component in `components/`; never duplicate markup across screens.
- Styling lives with the component (NativeWind classes or a co-located `StyleSheet`); no inline magic-number styles scattered through JSX.
- Icons: pick one icon pack (e.g. `@expo/vector-icons`) and stay consistent. Center icons via the parent's flex layout (`items-center justify-center` on the container), not by pinning a fixed height on the glyph itself: icon fonts render as `<Text>`, and platform text-metric handling (`textAlignVertical`, `includeFontPadding`) is Android-only and a no-op on iOS, so a "fixed box" fix that works on one platform silently breaks centering on the other.
- When a native OS chrome element (nav bar buttons, system dialogs) won't take your styling, don't fight it with text-alignment hacks: build the equivalent as a plain view you fully own instead.

## UI Rules

- First screen should be the usable app, not a splash/marketing screen.
- Respect safe areas (`react-native-safe-area-context`) on every top-level screen.
- Use platform-appropriate primitives: `Pressable` over raw `TouchableOpacity`, native navigation patterns per platform when they diverge.
- Prefer the OS-native header/nav chrome; only build a custom header when you need behavior the native one can't give you (and see Component Rules on owning centering when you do).
- Loading/error/empty states are not optional for any async screen.

## Testing Rule

- Jest setup: `jest-expo` preset, `@testing-library/react-native`, mock native modules that don't run in the test environment (camera, notifications, file system) at the boundary, not deep in business logic.
- Add unit/integration tests in the same ticket as each feature.
- Use hook/screen tests with injected gateways before device/E2E tests.
- Plan Maestro flows near the end, but do not create E2E tests automatically.
- Implement E2E only when the user confirms the UI/workflow is stable enough to lock.
- When testing with Maestro, mock external network calls where possible; prove backend correctness in backend tests, not device E2E.
- Release-build logging: a Release build on a physical device has no attached Metro console, so `console.log` output goes nowhere you can read. If field debugging matters, mirror console output to an on-device file (e.g. patch `console.*` to also append to a log file in the app's documents dir) so it can be pulled off the device (`xcrun devicectl device copy from` on iOS) after the fact.

## Verify

```bash
npm test
npx tsc --noEmit
npm run lint
npx eas build --platform ios --profile preview # or android; only when a device/store build is needed
npm run e2e # only when E2E has been approved and added
```
