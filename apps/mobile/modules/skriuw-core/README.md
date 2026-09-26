# skriuw-core

The Expo native module the mobile client reaches the shared Rust core through.
Architecture decision:
[ADR-0048](../../../../apps/docs/content/v2/adr/0048-native-mobile-shell-over-shared-core.md).
Implementation contract: [apps/docs/content/v2/specs/mobile-app.md](../../../../apps/docs/content/v2/specs/mobile-app.md),
requirements R-A1 and R-P3. The Rust side is
[`crates/skriuw-mobile`](../../../../crates/skriuw-mobile/README.md).

Expo autolinks everything under `apps/mobile/modules/`, so the application needs no
dependency entry: `import { skriuwCore } from "../modules/skriuw-core"`.

## Surface

| Call | Result |
| --- | --- |
| `protocolVersion()` | the workspace protocol version the native core speaks |
| `open(slot = "default")` | `{ slot, databasePath }`; re-opening the open slot re-attaches |
| `bootstrap()` | `WorkspaceSnapshot` JSON |
| `submitOperations(operationsJson)` | `OperationAck` JSON |
| `loadDocument(noteId)` | `WorkspaceDocument` JSON |
| `saveDocument(request)` | `OperationAck` JSON |
| `shutdown()` | drains the owner thread; safe when nothing is open |

Payloads stay the generated-contract JSON text the facade produces. The bridge
adapter (`apps/mobile/src/bridge`) owns parsing them into the generated contract
types, so this module holds no second copy of the contract.

Every call returns a promise and runs off the JS thread: Kotlin bodies are
coroutines moved to `Dispatchers.IO`, and Swift `AsyncFunction` bodies run on
the Expo modules background queue. There is no `Function`, constant or property
that reaches Rust synchronously, and
`__tests__/apps/mobile/modules/skriuw-core/core.test.ts` holds the
TypeScript surface to promises.

Failures reject with `SkriuwCoreError`; branch on `kind`. The kinds mirror
`MobileError` in the facade (`recovery`, `conflict` with both revisions,
`busy`, `unsupported-protocol` with its version, …) plus `invalid-slot` and
`slot-in-use` from this module. The native side resolves a
`{ ok, value | error }` envelope rather than rejecting, because a rejected Expo
promise only carries a code and a decorated message string, and the structured
fields of a conflict would have to be parsed back out of it.

## Decisions

**Hand-written Expo module over UniFFI Kotlin/Swift bindings, not
`uniffi-bindgen-react-native`.** Evaluated first, as the issue asks.
`uniffi-bindgen-react-native` generates a JSI Turbo Module in which every
non-`async` Rust function becomes a blocking JSI call on the JS thread. The
facade's calls are synchronous Rust by design (they wait on the runtime's owner
thread), so its whole surface would have been synchronous native calls, which
the contract and R-P3 forbid. Making the facade `async` would have pulled an
async runtime into `crates/skriuw-mobile` for the generator's benefit only. It
also needs its own runtime package in the application and a C++ build per
platform. The fallback keeps the facade untouched and puts the threading
decision in forty lines of Kotlin and Swift.

**Workspace location.** Android: `<filesDir>/workspaces/<slot>/skriuw.db`. iOS:
`Application Support/workspaces/<slot>/skriuw.db`. The slot is validated
against `^[a-z0-9][a-z0-9-]{0,63}$` in TypeScript and again natively, so no
path ever comes from JavaScript.

**Backup exclusion: not excluded.** Both locations are covered by Android Auto
Backup and iCloud device backup by default, and this module leaves that alone:
for a signed-out, local-only workspace the device backup is the only copy that
survives a lost phone. The issue allows exclusion only if the archive path
later needs it; that path (export, restore, archive swap) is out of scope for
mobile 1.0. Revisit when it lands or if restoring a database captured
mid-write shows up in practice; the change then is `isExcludedFromBackup` on
the `workspaces` directory on iOS and a `data-extraction-rules` entry in the
application manifest on Android.

**Bindings and libraries are build output.** UniFFI bindings embed checksums of
the library they were generated from, so `scripts/build-android.sh` builds the
libraries and generates the Kotlin from the same sources in one run, and both
are gitignored. The generator reads an unstripped host build because the
release profile strips the UniFFI metadata out of the Android libraries. Gradle fails
with the command to run when they are missing.

## Building

```bash
# once
rustup target add aarch64-linux-android x86_64-linux-android
cargo install cargo-ndk

apps/mobile/modules/skriuw-core/scripts/build-android.sh        # release; pass dev for a debug core
```

This fills `android/src/main/jniLibs/{arm64-v8a,x86_64}` and
`android/src/main/java/uniffi`. Release artifacts are built with
`panic = "unwind"`, which the facade's panic boundary depends on.

### Development build

Expo Go cannot load this module. From here on the application runs as a
development build:

```bash
apps/mobile/modules/skriuw-core/scripts/build-android.sh
cd mobile && bunx expo run:android
```

`expo run:android` prebuilds `apps/mobile/android` (gitignored), compiles the native
project with this module autolinked, installs it on the running emulator or
device and starts Metro. Re-run `build-android.sh` whenever
`crates/skriuw-mobile` changes; JavaScript changes only need Metro.

### iOS

`scripts/build-ios.sh` runs on macOS only. It produces
`ios/Frameworks/SkriuwMobile.xcframework` (device plus a fat simulator slice)
and `ios/Generated/skriuw_mobile.swift`. The `xcframework` job in
`.github/workflows/mobile-ci.yml` runs it on a macOS runner and publishes both
directories as one artifact.

### EAS Build

EAS workers get the repository without these gitignored artifacts and have no
Rust toolchain. `scripts/eas-build-pre-install.sh`, wired as the
`eas-build-pre-install` hook in `apps/mobile/package.json`, installs rustup,
the toolchain pinned in `rust-toolchain.toml` and the platform's targets, then
runs `build-android.sh` (plus cargo-ndk) or `build-ios.sh` according to
`EAS_BUILD_PLATFORM`. It is the pre-install hook because on iOS the
post-install hook runs after `pod install`, too late for the podspec to see
the framework and the Swift bindings.

**iOS is unverified.** The Swift module, the podspec and `build-ios.sh` have
not been compiled or run; they were written on Linux against the UniFFI Swift
output.

## Checks

```bash
cd apps/mobile
bun --cwd=../.. vitest run --project mobile __tests__/apps/mobile/modules/skriuw-core
bunx tsc --noEmit --project modules/skriuw-core
bunx tsc --noEmit --project ../../__tests__/apps/mobile

modules/skriuw-core/scripts/e2e-android.sh   # needs a booted emulator
```

`e2e-android.sh` prebuilds, assembles a release APK for the connected device's
ABI only (a four-ABI APK does not fit next to other applications on a stock
emulator image; Android refuses installs below roughly 500 MB free), clears the application's data, opens
the probe screen through the `skriuw://` scheme, expects it to create one note
through `submitOperations`, kills the process, relaunches and expects the note
to come back from native SQLite. The probe route is copied into `apps/mobile/app`
for the run and removed afterwards.
