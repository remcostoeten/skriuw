# App Store Connect listing

Locale `en-US`. Character limits are Apple's; the counts in brackets are the
copy below. Nothing here has been submitted. See
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
| Privacy policy URL | **`https://skriuw.com/privacy`, not published yet** |
| Copyright | 2026 Remco Stoeten |

## Name (30 max) [6]

```
Skriuw
```

## Subtitle (30 max) [29]

```
Local-first notes and journal
```

## Promotional text (170 max) [132]

```
Your notes are stored in a SQLite database on your phone. Sync is off until you sign in, and synced content is end-to-end encrypted.
```

## Keywords (100 max, comma-separated, no spaces) [100]

```
notes,markdown,local-first,offline,journal,tasks,knowledge,notebook,writing,encrypted,privacy,editor
```

## Description (4000 max)

```
Skriuw is a local-first notes app. Your workspace is a SQLite database on your phone, and the app needs no account. Notes, journal, tasks, and search work offline.

WRITING
A rich-text editor that saves Markdown. It has six heading levels, lists, checklists, quotes, tables, and code blocks with language and copy controls. Markdown input rules turn "# " and "**bold**" into formatting as you type. Type # to tag, @ to link another note, and $ for people. Relationships are stored by identity, so renaming a tag updates it everywhere. Notes carry typed properties, cover images, and rendered Mermaid diagrams.

ORGANIZING
A nested folder tree with pinned notes, a trash with undo, and full-text search over note bodies as well as titles.

JOURNAL
One entry per day in the same editor, with a mood per day, a month calendar, a 30-day mood trend, and an "on this day" section. Quick capture adds text to today's entry and queues it while you are offline.

TASKS
Checklist items become workspace tasks when you promote them. The tasks view lists them grouped by the note they came from. Completing a task rewrites the note's checklist line in the same write, so the two stay in agreement.

LOCKED NOTES
Lock a note behind a PIN or passphrase. The body is encrypted on disk with a key that only your secret or a one-time recovery code can open. A locked note stays out of search and links until you unlock it. Biometric unlock releases the stored PIN, not the key.

SYNC
Nothing leaves your phone until you sign in and turn sync on. Sync is end-to-end encrypted. A recovery code shown once derives the key on your devices and is never sent to the server. The server stores your notes, media, and checkpoints as opaque bytes. If you lose the code, you lose the cloud copy only. The notes on your devices are unchanged.

OTHER PLATFORMS
Skriuw also runs on macOS, Windows, and Linux, and in a browser. All versions use the same Rust core and document format.

PRIVACY
Skriuw contains no analytics or telemetry.

Skriuw is open source: github.com/remcostoeten/skriuw
```

## What's New in This Version (4000 max)

```
First release for iPhone. It includes the notes tree, the journal with a mood trend and quick capture, the tasks view, locked notes with biometric unlock, and optional end-to-end encrypted sync with the desktop and browser apps. It uses the same Rust core and editor as those apps.
```

## App Review information

| Field | Value |
| --- | --- |
| Sign-in required | No. The app is fully usable with no account; sync is opt-in. |
| Demo account | Not needed. To review sync, create an account from Account & sync inside the app. |
| Notes | Skriuw is local-first. All features except multi-device sync work offline with no account. Notes are stored in an on-device SQLite database. Locked notes are encrypted on the device and synced content is end-to-end encrypted. See the export compliance answers. |

## Screenshots

**Not produced.** Apple requires 6.9" (or 6.7") iPhone screenshots, and iOS
cannot be built or simulated on the development host (ADR-0048). They must be
captured from an EAS simulator build or a device once one exists.
