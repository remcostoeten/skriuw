# Mobile distribution channel

The iOS and Android client's store metadata and submission record. The product
contract is [`apps/docs/content/v2/specs/mobile-app.md`](../../apps/docs/content/v2/specs/mobile-app.md); the
architecture decision is
[ADR-0048](../../apps/docs/content/v2/adr/0048-native-mobile-shell-over-shared-core.md).

This channel is **not live**. Nothing has been submitted to either store, and
the blockers below are all outside `apps/mobile/` or outside this repository.

| Channel | Track | Identifier | Status |
| --- | --- | --- | --- |
| App Store | TestFlight internal | `dev.skriuw.app` | **Not submitted** — no Apple Developer team |
| Play Store | Internal testing | `dev.skriuw.app` | **Not submitted** — no Play Console app, no service account |

Desktop channels are separate and unaffected; see [`../README.md`](../README.md).

## Files

| File | Purpose |
| --- | --- |
| [`listing/app-store.md`](listing/app-store.md) | App Store Connect listing fields, ready to paste |
| [`listing/play-store.md`](listing/play-store.md) | Play Console listing fields, ready to paste |
| [`privacy.md`](privacy.md) | Apple App Privacy and Play Data Safety answers, plus the privacy policy text both stores require a public URL for |
| [`export-compliance.md`](export-compliance.md) | Encryption export answers for the E2EE sync and locked-note cryptography |
| [`PrivacyInfo.xcprivacy`](PrivacyInfo.xcprivacy) | The iOS privacy manifest, authored here and **not yet wired into the build** |
| [`submission-checklist.md`](submission-checklist.md) | The ordered human steps for a first TestFlight and Play internal-track release |

## How builds are produced

Builds already exist as CI outputs;
[`.github/workflows/mobile-ci.yml`](../../.github/workflows/mobile-ci.yml)
(Mobile 10, #391) owns them:

- Every PR touching `apps/mobile/`, `packages/` or `crates/skriuw-mobile` runs
  `bin/check mobile`, the native module surface tests, the facade host
  tests and an Android emulator end-to-end pass, and compiles
  `SkriuwMobile.xcframework` on a macOS runner.
- A `mobile-v*` tag additionally produces an Android APK and an iOS simulator
  application as workflow artifacts.

Store builds need EAS on top of that, using the profiles in
[`apps/mobile/eas.json`](../../apps/mobile/eas.json): `preview` for an internal APK,
`production` for the Play app bundle and the App Store build. The `submit`
profile is declared but empty.

Versioning is separate from the desktop line. Desktop releases are `v2-v*`
tags driven by `releaser.config.json`; the mobile client versions from
`apps/mobile/app.json` (`expo.version`, currently `0.1.0`) with `eas.json` set to
`appVersionSource: "remote"`, so EAS owns the build number. **Do not point the
desktop releaser at `apps/mobile/app.json`** — the two lines ship on their own
cadence and a shared version number would force one to wait for the other.

## Blockers before a first submission

Each of these is outside the paths Mobile 16 (#397) owns; they are recorded
here and on #397 rather than changed on this branch.

1. **EAS project linked, not yet buildable.** `apps/mobile/app.json` points at
   `@remcostoeten/skriuw` (`expo.extra.eas.projectId`), so `eas build`,
   `eas submit` and `eas simulator:availability` run from `apps/mobile/`. EAS
   Simulator answers `"available": false` for the account; it is waitlisted
   at <https://expo.dev/services/simulators>, so iOS evidence has to come from
   a real EAS build.
2. **`EXPO_TOKEN` is set** as a repository secret (a robot token of the
   `remcostoeten` account); the `eas-preflight` CI job checks for it.
3. **The Rust libraries EAS needs are gitignored**, so they are built on the
   worker by the `eas-build-pre-install` hook in `apps/mobile/package.json`
   (see `apps/mobile/modules/skriuw-core/README.md`). eas-cli reads
   `.easignore` only from the Git root, so a file in `apps/mobile/` would have
   had no effect. Not yet exercised by a real EAS build.
4. **No public privacy policy URL.** Both stores require one before a listing
   can be reviewed. `site/` has no privacy page; the text to publish is in
   [`privacy.md`](privacy.md).
5. **No Apple Developer Program membership and no Google Play developer
   account** recorded anywhere in this repository. Both are paid, identity-
   verified accounts with their own lead time (Apple's D-U-N-S check for an
   organisation, Google's 14-day closed test requirement for a new personal
   developer account before production access).
6. **`expo-secure-store` is not a dependency.** `apps/mobile/src/features/auth/keystore.ts`
   and the biometric slot in `apps/mobile/src/features/lock/biometrics.ts` both
   refuse without it, so a build from this tree cannot store a sign-in
   credential or offer biometric unlock. Owner: Mobile 14 (#395) and Mobile 15
   (#396).
7. **The iOS privacy manifest is not in the build.** `PrivacyInfo.xcprivacy`
   has to reach the application target, which means an Expo config plugin or
   an entry in `apps/mobile/app.json` — both outside this issue's paths.
8. **No iOS share extension.** `apps/mobile/src/features/capture/share-extension/`
   ships an Android intent filter only, so "share to Skriuw" is Android-only.
   The iOS share sheet was the motivating gap in ADR-0048's Context; shipping
   1.0 without it is a product decision that should be explicit.
