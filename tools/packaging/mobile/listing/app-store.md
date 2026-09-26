# App Store Connect listing

Locale `en-US`. Character limits are Apple's; the counts in brackets are the
copy below. Nothing here has been submitted — see
[`../README.md`](../README.md).

## App information

| Field | Value |
| --- | --- |
| Bundle ID | `dev.skriuw.app` |
| SKU | `skriuw-mobile` |
| Primary category | Productivity |
| Secondary category | Utilities |
| Age rating | 4+ (no objectionable content; no user-generated content shared between users) |
| Content rights | Does not contain, show, or access third-party content |
| Support URL | `https://github.com/remcostoeten/skriuw` |
| Marketing URL | `https://skriuw.com` |
| Privacy policy URL | **`https://skriuw.com/privacy` — not published yet** |
| Copyright | 2026 Remco Stoeten |

## Name (30 max) [6]

```
Skriuw
```

## Subtitle (30 max) [29]

```
Local-first notes that fly
```

## Promotional text (170 max) [152]

```
Your notes live on your phone, in a real database, and open the moment you tap them. Sync is off until you ask for it, and end-to-end encrypted when you do.
```

## Keywords (100 max, comma-separated, no spaces) [96]

```
notes,markdown,local-first,offline,journal,tasks,knowledge,notebook,writing,encrypted,privacy,editor
```

## Description (4000 max)

```
Skriuw is a notes app that never makes you wait.

Your workspace is a SQLite database on your phone. Open a note and it is there
in the same frame — no spinner, no server round-trip, no account. Everything
works with the aeroplane mode switch on.

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
a thirty-day mood trend, and "on this day" recall. Quick capture puts a
thought into today's entry in two taps, and it queues while you are offline.

TASKS
Checklist items you promote into real workspace tasks, listed in one view and
grouped by the note they came from. Completing a task rewrites the note's
checklist line in the same write, so the two can never disagree.

LOCKED NOTES
Lock any note behind a PIN or passphrase. The body is encrypted on disk with a
key only your secret or a one-time recovery code can open, and it stays out of
search and links until you unlock it. Optional biometric unlock saves typing
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

## What's New in This Version (4000 max)

```
The first Skriuw release for iPhone.

Your whole workspace, native: the notes tree, the journal with its mood trend
and quick capture, the tasks view, locked notes with biometric unlock, and
optional end-to-end encrypted sync with the desktop and browser apps — all over
the same Rust core, with the same editor.
```

## App Review information

| Field | Value |
| --- | --- |
| Sign-in required | No. The app is fully usable with no account; sync is opt-in. |
| Demo account | Not needed. To review sync, create an account from Account & sync inside the app. |
| Notes | Skriuw is local-first. All features except multi-device sync work offline with no account. Notes are stored in an on-device SQLite database. Locked notes and sync use end-to-end encryption; see the export compliance answers. |

## Screenshots

**Not produced.** Apple requires 6.9" (or 6.7") iPhone screenshots, and iOS
cannot be built or simulated on the development host (ADR-0048). They must be
captured from an EAS simulator build or a device once one exists.
