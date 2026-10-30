# First submission checklist

The ordered steps from this repository to a TestFlight build and a Play
internal-track build. Each open step names what is missing so the next
person does not rediscover it.

`[ ]` is outstanding. `[x]` is done and where the evidence is.

## 0. Accounts and one-time filings

- [ ] Apple Developer Program membership (99 USD/year). Organisation
      enrolment needs a D-U-N-S number and takes days to weeks.
- [ ] Google Play developer account (25 USD once). A new **personal** account
      must run a closed test with at least 12 testers for 14 consecutive days
      before production access is granted; an internal test does not satisfy
      it. Plan for that if the account is personal rather than organisational.
- [ ] BIS §742.15(b) open-source encryption notification — see
      [`export-compliance.md`](export-compliance.md).
- [ ] Publish the privacy policy at `https://skriuw.com/privacy` — text in
      [`privacy.md`](privacy.md). Touches `site/`.

## 1. Unblock EAS

- [x] Create the EAS project and add `expo.extra.eas.projectId` to
      `apps/mobile/app.json` — `@remcostoeten/skriuw`, #421.
      `eas simulator:availability --json` runs and answers
      `"available": false`: the account is on the EAS Simulator waitlist.
- [x] Add the `EXPO_TOKEN` repository secret so the `eas-preflight` job in
      `.github/workflows/mobile-ci.yml` stops skipping.
- [x] Make the Rust libraries reach EAS workers: the `eas-build-pre-install`
      hook in `apps/mobile/package.json` runs
      `apps/mobile/modules/skriuw-core/scripts/eas-build-pre-install.sh`, which
      installs the toolchain and builds them on the worker. A
      `apps/mobile/.easignore` cannot do it: eas-cli only reads `.easignore` at
      the Git root, where it would replace every `.gitignore` in the monorepo.
- [x] Run the first Android EAS build interactively from `apps/mobile/` so EAS
      generates and stores the keystore: preview build `56b4f6ac`, 2026-09-26.
- [x] Run an iOS build on EAS to prove the pipeline: `development-simulator`
      build `3a73aeb1`, 2026-10-30, finished in 11 minutes.
- [ ] Run the first iOS device build interactively (`./bin/eas build ios
      development`) once an Apple team is linked, so EAS creates the signing
      credentials; `eas-preview` in CI runs `--non-interactive` and cannot.
- [ ] Register the test iPhone with `./bin/eas device` and install the
      `development` build on it; the steps are in
      [`docs/mobile-builds.md`](../../../docs/mobile-builds.md#testing-on-an-iphone).
- [ ] Fill the `submit.production` profile in `apps/mobile/eas.json` with the Apple
      team and ASC app identifiers, and the Play service-account key path.
- [ ] Run eas-cli **from `apps/mobile/`**, never from the repository root: it drops
      a stray `app.json` at the working directory.

## 2. Close the product blockers

- [x] Add `expo-secure-store` so the keystore port and the biometric slot work
      on device. #420.
- [x] Fix the two touch-target violations and the Android sheet-modality gap
      from [the accessibility pass](../../../docs/benchmarks/2026-09-20-mobile-accessibility.md).
      #422.
- [x] Merge Mobile 11's search surface. PR #413, routed by #419.
- [ ] Decide whether 1.0 ships without an iOS share extension — the Android
      intent filter has no iOS counterpart, and the iOS share sheet was the
      motivating gap in ADR-0048.
- [x] Wire the iOS privacy manifest into the build and set
      `ITSAppUsesNonExemptEncryption`: both live in `apps/mobile/app.json`
      (`ios.privacyManifests`, `ios.infoPlist`).

## 3. Evidence the contract asks for

- [ ] Run the reference-device benchmarks and record them in
      `docs/benchmarks/`. Currently blocked on host disk; see
      [the readiness document](../../docs/benchmarks/2026-09-20-mobile-release-readiness.md#not-measured-and-why).
- [ ] Run a VoiceOver pass on iOS and a TalkBack pass on Android over every
      screen, and record the results beside the mechanical audit.
- [x] Mechanical accessibility audit of every route and overlay — 184
      controls, all named; three defects found.
      [`2026-09-20-mobile-accessibility.md`](../../docs/benchmarks/2026-09-20-mobile-accessibility.md)
- [x] Shared-layer performance evidence at 1,000 and 5,000 notes.
      [`2026-09-20-mobile-release-readiness.md`](../../docs/benchmarks/2026-09-20-mobile-release-readiness.md)

## 4. Assets

- [ ] iPhone 6.9" screenshots (App Store), at least two phone screenshots plus
      a 1024 × 500 feature graphic and a 512 × 512 icon (Play). All need a
      real build on a real screen.
- [x] Listing copy, both stores. [`listing/`](listing)
- [x] Privacy declarations, both stores. [`privacy.md`](privacy.md)
- [x] Export compliance answers. [`export-compliance.md`](export-compliance.md)

## 5. Build and submit

- [ ] `eas build --platform android --profile production` → upload the app
      bundle to the **Internal testing** track.
- [ ] `eas build --platform ios --profile production` → upload to **TestFlight**,
      internal group.
- [ ] Complete the App Privacy and Data safety forms from
      [`privacy.md`](privacy.md), and the encryption questionnaire from
      [`export-compliance.md`](export-compliance.md).
- [ ] Install both builds on real hardware and smoke-test by hand: first run
      with no account, create and edit a note, journal entry with a mood,
      promote and complete a task, lock a note and unlock it with biometrics,
      sign in and let a second device converge, share text into the app
      (Android), force-quit and relaunch to confirm nothing was lost.
- [ ] Record who ran that pass, on which devices and OS versions, and what
      they found — in `docs/benchmarks/` beside the performance evidence.

**Acceptance for #397 is not met until step 5's human smoke test has actually
happened.** No automated evidence substitutes for it, and this branch does not
claim otherwise.
