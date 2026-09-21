# Privacy answers and policy

Three things both stores want: a structured data-collection declaration, a
machine-readable manifest (iOS), and a policy at a public URL. The first two
are below; the third is drafted here and **not published anywhere yet**.

Everything here describes the mobile client at `dev.skriuw.app`. It is
consistent with the desktop and browser builds by construction — they share the
Rust core, the sync protocol, and the same absence of analytics.

## What the app actually does with data

Established from the source rather than from intent:

- **Notes, journal entries, tasks, tags, people, and media** live in a SQLite
  database inside the app's own container. Nothing is uploaded until a user
  signs in and turns sync on.
- **Sync, when enabled**, replicates versioned operations to the Skriuw cloud
  Worker over HTTPS. Content is sealed on the device first: Argon2id
  (19 MiB, t = 2) derives a workspace content key from a recovery code, and
  XChaCha20-Poly1305 seals note bodies, titles, tags, people, media, and
  checkpoints ([ADR-0043](../../docs/adr/0043-end-to-end-encrypted-sync.md)).
  The service stores opaque bytes plus what ordering needs: identifiers,
  sequence numbers, sizes, and timestamps. The recovery code is never sent.
- **The account** is an email address and a password, held by Better Auth on
  the Skriuw cloud. The session credential is written only to the platform
  keystore (`apps/mobile/src/features/auth/keystore.ts`), never to
  JavaScript-reachable storage.
- **Locked notes** are encrypted at rest on the device with their own key
  ([ADR-0044](../../docs/adr/0044-locked-notes.md)). Biometric unlock stores
  the user's PIN — not the key — in a keystore entry the platform releases
  only after a successful biometric prompt.
- **No analytics, crash reporting, advertising identifier, or telemetry of any
  kind.** A fresh install performs no network request.

## Apple App Privacy (App Store Connect → App Privacy)

**Does this app collect data?** Yes — two types, both linked to identity,
neither used for tracking.

| Data type | Collected | Linked to user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info → Email Address | Yes, only if the user creates an account | Yes | No | App Functionality (authentication) |
| User Content → Other User Content | Yes, only while sync is enabled | Yes | No | App Functionality (multi-device sync) |

Notes for the reviewer-facing description:

- Both are optional: the app is fully functional with no account and no sync.
- Synced user content is end-to-end encrypted on the device; the service
  cannot read it.
- **Tracking: No.** No data is shared with third parties, and the app contains
  no advertising or analytics SDK, so App Tracking Transparency does not apply
  and no `NSUserTrackingUsageDescription` is needed.

Not collected, and each must be answered "No": Health & Fitness, Financial
Info, Location, Sensitive Info, Contacts, Browsing History, Search History,
Identifiers, Purchases, Usage Data, Diagnostics.

## Play Data Safety (Play Console → App content → Data safety)

**Does your app collect or share any of the required user data types?** Yes,
collect; **no sharing with third parties**.

| Data type | Collected | Shared | Processed ephemerally | Required | Purpose |
| --- | --- | --- | --- | --- | --- |
| Personal info → Email address | Yes | No | No | Optional | Account management |
| Files and docs → Files and docs | Yes | No | No | Optional | App functionality |

Security practices to declare:

- **Is all user data encrypted in transit?** Yes (HTTPS, plus end-to-end
  encryption of the payload).
- **Do you provide a way for users to request data deletion?** Yes — deleting
  the account removes the server-side workspace; local data is removed by
  uninstalling. Deletion request URL: the support address in the listing.
- **Has your app been independently validated against a security standard?**
  No.
- **Committed to Play Families policy?** No, the app is not directed at
  children.

Every other data type — Location, Financial info, Health and fitness, Messages,
Photos and videos, Audio files, Calendar, Contacts, App activity, Web browsing,
App info and performance, Device or other IDs — is **not collected**.

## Policy text to publish

Both stores need this at a public URL (`https://skriuw.com/privacy` in the
listings). Publishing it touches `site/`, which Mobile 16 does not own.

---

### Skriuw privacy policy

*Last updated: 20 September 2026*

**The short version.** Skriuw stores your notes on your own device. Nothing is
sent anywhere unless you create an account and turn sync on. There is no
analytics, no advertising, and no tracking of any kind.

**What is stored on your device.** Your notes, journal entries, tasks, tags,
people, images, and settings are kept in a database inside the app's private
storage. Notes or folders you lock are additionally encrypted with a key
derived from your PIN, passphrase, or recovery code.

**What leaves your device, and only if you ask.** Creating an account sends an
email address and a password to the Skriuw sync service. Turning sync on then
replicates your workspace to that service. Before anything is uploaded it is
encrypted on your device with a key derived from a recovery code that is shown
to you once and never transmitted. The service can order and store your data;
it cannot read it. It does retain what ordering requires — identifiers,
sequence numbers, content sizes, and timestamps — and the email address on
your account.

**What is never collected.** No usage analytics, no crash reports, no
advertising identifier, no location, no contacts, no device fingerprint. A
fresh install makes no network request at all.

**Third parties.** Your data is not sold, rented, or shared. The sync service
is operated by the developer on Cloudflare infrastructure; no other processor
receives your content.

**Retention and deletion.** Local data is removed when you delete the app.
Server-side data is removed when you delete your account, which you can do
from Account & sync in the app or by writing to the support address below.
Losing your recovery code makes the cloud copy permanently unreadable — by us
as well as by you — and leaves the notes on your devices untouched.

**Children.** Skriuw is not directed at children under 13 and does not
knowingly collect their data.

**Changes.** Material changes to this policy will be noted in the app's
release notes.

**Contact.** remcostoeten@hotmail.com

---

## Apple privacy manifest

[`PrivacyInfo.xcprivacy`](PrivacyInfo.xcprivacy) declares the two collected
data types and the required-reason APIs Expo's own modules use. It is **not in
the build yet** — see the blockers in [`README.md`](README.md).
