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
- [ ] Add the `EXPO_TOKEN` repository secret so the `eas-preflight` job in
      `.github/workflows/mobile-ci.yml` stops skipping.
- [ ] Make the Rust libraries reach EAS workers — they are gitignored, so add
      an `eas-build-post-install` script to `apps/mobile/package.json` that
      installs rustup targets and cargo-ndk and runs
      `apps/mobile/modules/skriuw-core/scripts/build-android.sh` (and
      `build-ios.sh` on macOS workers). A `apps/mobile/.easignore` cannot do it:
      eas-cli only reads `.easignore` at the Git root, where it would replace
      every `.gitignore` in the monorepo. Recorded against #421.
- [ ] Fill the `submit.production` profile in `apps/mobile/eas.json` with the Apple
      team and ASC app identifiers, and the Play service-account key path.
- [ ] Run eas-cli **from `apps/mobile/`**, never from the repository root: it drops
      a stray `app.json` at the working directory.

## 2. Close the product blockers

- [ ] Add `expo-secure-store`. Without it the keystore port and the biometric
      slot both refuse, so sign-in cannot persist a credential and biometric
      unlock cannot be offered. Owners: #395, #396.
- [ ] Fix the two touch-target violations and the Android sheet-modality gap
      from [the accessibility pass](../../docs/benchmarks/2026-09-20-mobile-accessibility.md).
      Owners: #388, #393.
- [ ] Merge Mobile 11's search surface (PR #413) or ship without a search
      route and say so in the listing.
- [ ] Decide whether 1.0 ships without an iOS share extension — the Android
      intent filter has no iOS counterpart, and the iOS share sheet was the
      motivating gap in ADR-0048.
- [ ] Wire [`PrivacyInfo.xcprivacy`](PrivacyInfo.xcprivacy) into the iOS
      target, and add `ITSAppUsesNonExemptEncryption` to `ios.infoPlist`.

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
