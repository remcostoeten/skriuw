# Mobile builds

The mobile app in `apps/mobile` is built in two places. CI builds unsigned
artifacts on every relevant change, and [EAS](https://expo.dev/eas) builds the
signed apps that install on real devices and go to the stores. This page covers
the EAS side. The product contract is the [mobile app spec](specs/mobile-app.md),
and the architecture decision is
[ADR-0048](adr/0048-native-mobile-shell-over-shared-core.md).

## bin/eas

`./bin/eas` wraps eas-cli. Use it instead of calling `eas` directly: it always
runs from `apps/mobile`, because eas-cli writes a stray `app.json` into whatever
directory it runs from. It uses a global `eas` when one is installed and
`bunx eas-cli@latest` otherwise.

| Command | Does |
| --- | --- |
| `./bin/eas login` | Sign in to expo.dev |
| `./bin/eas whoami` | Show the signed-in Expo account |
| `./bin/eas build <platform> [profile]` | Cloud build; platform `android`, `ios` or `all`; profile `preview` (default), `development`, `development-simulator` or `production` |
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
| `development` | Debug APK; iOS device build | A development client that loads JavaScript from Metro, installed on your own phones |
| `development-simulator` | iOS simulator build | The same client for a simulator, and the iOS pipeline check that needs no Apple team |
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

## Testing on an iPhone

iOS cannot be built on Linux, so the phone runs a development client that EAS
builds, and Metro on this machine serves the JavaScript. A native change (a
new SDK, a native module, a config plugin) needs a new client; everything else
is a reload.

1. Join the Apple Developer Program. Ad hoc distribution, which is what
   installs a build outside the App Store, needs a team; a free Apple ID
   cannot sign for a device through EAS. No team is linked yet:
   `./bin/eas device` answers "No Apple teams found".
2. Register the phone with `./bin/eas device`. It prints a link; open it on
   the iPhone and install the profile, which records the UDID with Apple.
3. Build the client with `./bin/eas build ios development`. The first run is
   interactive: it signs in to the team, creates the ad hoc provisioning
   profile for the registered phones and stores it on EAS. Later runs are
   unattended.
4. Install it from the build page: the QR code the command prints, or the
   link from `./bin/eas builds`, opened on the phone.
5. Serve the JavaScript: `bun run editor:page` once from `apps/mobile`, then
   `bun run mobile` from the repository root. Scan the QR code from the
   development client with the phone on the same network, or start Metro
   with `./bin/dev mobile --tunnel` when it is not.

Without a team, `./bin/eas build ios development-simulator` still proves the
iOS half of the pipeline: the Rust core, the Swift module and the pods compile
on a macOS worker and produce a simulator app. The first such build on SDK 58
is `3a73aeb1` (2026-10-30, 11 minutes), listed by `./bin/eas builds`.

## Without an Apple team: sideloading

A free Apple ID can sign an app for personal use: the signature lasts 7 days
and three such apps can be installed at once. Apple does that signing in
Xcode, so from Linux the build and the signing are split:

1. Run `mobile-ci.yml` (`./bin/eas ci`, or a `mobile-v*` tag). Its
   `ios-device-unsigned` job builds a release app for a real iPhone with code
   signing turned off and uploads `skriuw-ios-unsigned-ipa`. The JavaScript
   and the editor page are embedded, so the app runs without Metro.
2. Sign and install the `.ipa` with your Apple ID: Sideloadly or AltServer on
   any borrowed Windows or Mac machine, or SideStore on the phone itself,
   which re-signs over Wi-Fi after a one-time pairing file made on Linux
   with `idevicepair`.
3. Re-sign before the 7 days run out, or the app stops opening until you do.

A free Apple ID gets no App Groups, so an iOS share extension would not work
there; the capture inbox already falls back to the app's own documents
directory. Face ID, the keychain and locked notes work as in a signed build.

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
[submission checklist](../tools/packaging/mobile/submission-checklist.md).
Store metadata lives in
[`tools/packaging/mobile`](../tools/packaging/mobile).
