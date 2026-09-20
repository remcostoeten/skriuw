# Play Console listing

Locale `en-US`. Character limits are Google's; the counts in brackets are the
copy below. Nothing here has been submitted — see
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
| Privacy policy | **`https://skriuw.com/privacy` — not published yet** |
| Content rating | Everyone (IARC questionnaire: no violence, no user-to-user communication, no purchases, no location sharing) |
| Ads | Contains no ads |
| Target audience | 13+ |
| Government app | No |
| Financial features | None |

## App name (30 max) [6]

```
Skriuw
```

## Short description (80 max) [78]

```
Local-first notes, journal and tasks. Offline by default, encrypted when synced.
```

## Full description (4000 max)

```
Skriuw is a notes app that never makes you wait.

Your workspace is a SQLite database on your phone. Open a note and it is there
in the same frame — no spinner, no server round-trip, no account. Everything
works with aeroplane mode on.

WRITING
A real rich-text editor that speaks Markdown: six heading levels, lists,
checklists, quotes, tables, code blocks with language and copy controls, and
Markdown input rules so "# " and "**bold**" just work as you type. Type # to
tag, @ to link another note, and $ for people — relationships are stored by
identity, so renaming a tag updates it everywhere instead of quietly breaking.
Notes carry typed properties, cover images, and rendered Mermaid diagrams.

ORGANIZING
A nested folder tree with pinned notes, trash with undo, and full-text search
over note bodies rather than titles alone.

JOURNAL
One entry per day in the same editor, with a mood per day, a month calendar,
a thirty-day mood trend, and "on this day" recall. Share text or a link from
any app straight into today's entry — it queues while you are offline and
lands when you are back.

TASKS
Checklist items you promote into real workspace tasks, listed in one view and
grouped by the note they came from. Completing a task rewrites the note's
checklist line in the same write, so the two can never disagree.

LOCKED NOTES
Lock any note behind a PIN or passphrase. The body is encrypted on disk with a
key only your secret or a one-time recovery code can open, and it stays out of
search and links until you unlock it. Optional fingerprint unlock saves typing
the PIN, never the key.

SYNC, IF YOU WANT IT
Nothing leaves your phone until you sign in and turn sync on. When you do, it
is end-to-end encrypted: a recovery code shown once derives the key on your
devices, the server never sees it, and your notes, media, and checkpoints are
stored as opaque bytes. Lose the code and you lose the cloud copy only — the
notes on your devices are untouched.

THE SAME WORKSPACE EVERYWHERE
Skriuw runs on macOS, Windows, and Linux, and in any browser, on the same Rust
core and the same document format. Notes you write here open there.

NO TELEMETRY
There is no analytics of any kind. A fresh install makes no network request.

Skriuw is open source: github.com/remcostoeten/skriuw
```

## Release notes (500 max per release)

```
The first Skriuw release for Android.

Your whole workspace, native: the notes tree, the journal with its mood trend
and share-to-Skriuw capture, the tasks view, locked notes with fingerprint
unlock, and optional end-to-end encrypted sync with the desktop and browser
apps — all over the same Rust core, with the same editor.
```

## Declared permissions

`mobile/app.json` declares no runtime permissions. The only manifest addition
is the share intent filter from
`mobile/src/features/capture/share-extension/plugin.js`
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
