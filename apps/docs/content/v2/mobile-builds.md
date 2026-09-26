---
title: "Mobile builds"
description: "Build, sign, and submit the iOS and Android app with EAS through bin/eas."
---

The mobile app in `apps/mobile` is built in two places. CI builds unsigned
artifacts on every relevant change, and [EAS](https://expo.dev/eas) builds the
signed apps that install on real devices and go to the stores. This page covers
the EAS side. The product contract is the [mobile app spec](/v2/specs/mobile-app),
and the architecture decision is
[ADR-0048](/v2/adr/0048-native-mobile-shell-over-shared-core).

## bin/eas

`./bin/eas` wraps eas-cli. Use it instead of calling `eas` directly: it always
runs from `apps/mobile`, because eas-cli writes a stray `app.json` into whatever
directory it runs from. It uses a global `eas` when one is installed and
`bunx eas-cli@latest` otherwise.

| Command | Does |
| --- | --- |
| `./bin/eas login` | Sign in to expo.dev |
| `./bin/eas whoami` | Show the signed-in Expo account |
| `./bin/eas build <platform> [profile]` | Cloud build; platform `android`, `ios` or `all`; profile `preview` (default), `development` or `production` |
| `./bin/eas builds` | List the ten latest builds |
| `./bin/eas credentials [platform]` | Manage signing keys and certificates |
| `./bin/eas device` | Register an iPhone for internal iOS builds |
| `./bin/eas submit <platform>` | Upload the latest production build to the store |
| `./bin/eas simulator` | Check EAS Simulator access |
| `./bin/eas ci [ref]` | Run `mobile-ci.yml`, including the EAS jobs, on a branch (default: the current one) |
| `./bin/eas token` | Open the Expo access-token page and set the `EXPO_TOKEN` secret |
| `./bin/eas dashboard` | Open the project on expo.dev |

Any other command passes through to eas-cli unchanged, from `apps/mobile`.

## Profiles

The profiles live in `apps/mobile/eas.json`.

| Profile | Output | For |
| --- | --- | --- |
| `development` | Debug APK; iOS simulator build | A development client that loads JavaScript from Metro |
| `preview` | Release APK; internal iOS build | Installing on your own devices |
| `production` | Play app bundle; App Store build | Store submission |

EAS owns the build number (`appVersionSource: "remote"`, and `production`
auto-increments it). The user-facing version is `expo.version` in
`apps/mobile/app.json`. It is separate from the desktop `v2-v*` release line, so
do not point the desktop releaser at it.

## The Rust core on EAS workers

The app calls the shared Rust core through the `skriuw-core` native module. Its
compiled libraries and UniFFI bindings are gitignored, and EAS workers have no
Rust toolchain, so the workers build them before each run.

The `eas-build-pre-install` hook in `apps/mobile/package.json` runs
`apps/mobile/modules/skriuw-core/scripts/eas-build-pre-install.sh`. The script
installs rustup, the toolchain pinned in `rust-toolchain.toml`, and the targets
for the platform in `EAS_BUILD_PLATFORM`. It then runs one of two build scripts:

- Android: `build-android.sh`, after installing cargo-ndk.
- iOS: `build-ios.sh`.

It has to be the pre-install hook. On iOS, the post-install hook runs after
`pod install`, which is too late for the podspec to find the framework and the
Swift bindings.

A `.easignore` cannot ship the prebuilt libraries instead. eas-cli reads it only
from the Git root, where it would replace every `.gitignore` in the monorepo.

Compiling the core adds several minutes to every EAS build.

## First build

The first build per platform must run interactively. EAS needs to create and
store the signing credentials, and CI builds run with `--non-interactive`, so
they cannot do it.

```bash
./bin/eas login
./bin/eas build android     # accept "Generate a new Android Keystore"
./bin/eas build ios         # needs an Apple Developer team
```

Once the credentials exist, builds can run unattended.

## CI

`.github/workflows/mobile-ci.yml` runs on every change to `apps/mobile`, the
shared mobile packages, or `crates/skriuw-mobile`. It runs the mobile gate, an
Android emulator pass, and a macOS job that compiles `SkriuwMobile.xcframework`.
None of these need EAS.

The signed `eas-preview` job runs only on a `mobile-v*` tag or a manual run
(`./bin/eas ci`), so pull requests do not spend EAS build minutes. The
`eas-preflight` job runs first and needs three things:

- The `EXPO_TOKEN` repository secret.
- `expo.extra.eas.projectId` in `apps/mobile/app.json`.
- The `eas-build-pre-install` hook in `apps/mobile/package.json`.

If one is missing, it records the reason as a warning and the EAS job is skipped
rather than marked green.

## Store submission

Submission is not live yet. The remaining accounts, credentials, assets, and
manual checks are tracked in the
[submission checklist](https://github.com/remcostoeten/skriuw/blob/daddy/packaging/mobile/submission-checklist.md).
Store metadata lives in
[`packaging/mobile`](https://github.com/remcostoeten/skriuw/tree/daddy/packaging/mobile).
