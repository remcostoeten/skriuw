# Skriuw mobile

The iOS and Android client for the v2 workspace. Architecture decision:
[ADR-0048](../../docs/adr/0048-native-mobile-shell-over-shared-core.md).
Implementation contract: [docs/specs/mobile-app.md](../../docs/specs/mobile-app.md).

Routes live in `app/`; everything else lives in `src/`. The native module in
`modules/skriuw-core` wraps the shared Rust core, `src/bridge` is the mobile
implementation of the command surface, and `src/editor` hosts the desktop
editor bundle in one persistent webview.

## Commands

Dependencies are installed once from the repository root with `bun install`;
`apps/workspace/`, `apps/mobile/`, and `packages/*` are Bun workspaces.

```bash
bun run mobile              # expo start, from the repository root
./bin/check mobile          # the product gate: typecheck and unit tests
```

From this directory, `bun run android`, `bun run ios` and `bun run web` start
Expo on a single platform. Run `bun run editor:page` once first so notes open
in the editor; `bun run export:android` and `bun run export:ios` build it
themselves. See [the editor host](src/editor/README.md#packaging-the-editor-page).

The app needs a development build, not Expo Go: it carries a local native
module and a config plugin.

## Running on Android locally

```bash
rustup target add aarch64-linux-android x86_64-linux-android   # once
modules/skriuw-core/scripts/build-android.sh                   # the Rust core, again after crates/skriuw-mobile changes
bun run editor:page                                            # the editor page the webview embeds
npx expo run:android --no-bundler --device <emulator or device>
npx expo start --dev-client                                    # add --port when 8081 is taken
```

Then open the app; the development client connects to Metro. When
`adb install` reports insufficient storage, uninstall old builds from the
emulator first. Android is the local verification target. iOS cannot be
built or simulated on Linux; EAS builds it, and
[docs/mobile-builds.md](../../docs/mobile-builds.md) covers the profiles and
how to put a development build on an iPhone.
