# Play Console listing

Locale `en-US`. Character limits are Google's; the counts in brackets are the
copy below. Nothing here has been submitted. See
[`../README.md`](../README.md).

## Store settings

| Field | Value |
| --- | --- |
| Package name | `dev.skriuw.app` |
| App or game | App |
| Free or paid | Free |
| Category | Productivity |
| Tags | Notes, Productivity, Writing |
| Contact email | `remcostoeten@hotmail.com` |
| Website | `https://skriuw.com` |
| Privacy policy | **`https://skriuw.com/privacy`, not published yet** |
| Content rating | Everyone (IARC questionnaire: no violence, no user-to-user communication, no purchases, no location sharing) |
| Ads | Contains no ads |
| Target audience | 13+ |
| Government app | No |
| Financial features | None |

## App name (30 max) [6]

```
Skriuw
```

## Short description (80 max) [79]

```
Local-first notes, journal, and tasks. Works offline. Encrypted sync is opt-in.
```

## Full description (4000 max)

```
Skriuw is a local-first notes app. Your workspace is a SQLite database on your phone, and the app needs no account. Notes, journal, tasks, and search work offline.

WRITING
A rich-text editor that saves Markdown. It has six heading levels, lists, checklists, quotes, tables, and code blocks with language and copy controls. Markdown input rules turn "# " and "**bold**" into formatting as you type. Type # to tag, @ to link another note, and $ for people. Relationships are stored by identity, so renaming a tag updates it everywhere. Notes carry typed properties, cover images, and rendered Mermaid diagrams.

ORGANIZING
A nested folder tree with pinned notes, a trash with undo, and full-text search over note bodies as well as titles.

JOURNAL
One entry per day in the same editor, with a mood per day, a month calendar, a 30-day mood trend, and an "on this day" section. Share text or a link from any app into today's entry. The share queues while you are offline.

TASKS
Checklist items become workspace tasks when you promote them. The tasks view lists them grouped by the note they came from. Completing a task rewrites the note's checklist line in the same write, so the two stay in agreement.

LOCKED NOTES
Lock a note behind a PIN or passphrase. The body is encrypted on disk with a key that only your secret or a one-time recovery code can open. A locked note stays out of search and links until you unlock it. Fingerprint unlock releases the stored PIN, not the key.

SYNC
Nothing leaves your phone until you sign in and turn sync on. Sync is end-to-end encrypted. A recovery code shown once derives the key on your devices and is never sent to the server. The server stores your notes, media, and checkpoints as opaque bytes. If you lose the code, you lose the cloud copy only. The notes on your devices are unchanged.

OTHER PLATFORMS
Skriuw also runs on macOS, Windows, and Linux, and in a browser. All versions use the same Rust core and document format.

PRIVACY
Skriuw contains no analytics or telemetry.

Skriuw is open source: github.com/remcostoeten/skriuw
```

## Release notes (500 max per release)

```
First release for Android. It includes the notes tree, the journal with a mood trend and share-to-Skriuw capture, the tasks view, locked notes with fingerprint unlock, and optional end-to-end encrypted sync with the desktop and browser apps. It uses the same Rust core and editor as those apps.
```

## Declared permissions

`apps/mobile/app.json` declares no runtime permissions. The only manifest addition
is the share intent filter from
`apps/mobile/src/features/capture/share-extension/plugin.js`
(`android.intent.action.SEND`, `text/plain`), which is not a permission and
needs no declaration form.

Biometric unlock reaches the Android Keystore through `expo-secure-store`'s
`requireAuthentication`; when that dependency is added it brings
`android.permission.USE_BIOMETRIC`, which is a normal permission and also
needs no declaration form.

No sensitive permission (location, camera, microphone, contacts, SMS, call log,
all-files access, exact alarms, accessibility service, package queries) is
requested, so no Play permissions declaration is required.

## Graphic assets

**Not produced.** Google requires an app icon (512 × 512), a feature graphic
(1024 × 500), and at least two phone screenshots. Screenshots must come from a
real build; the development host cannot currently boot an emulator, so these
wait on the same unblocking as the device benchmarks.
