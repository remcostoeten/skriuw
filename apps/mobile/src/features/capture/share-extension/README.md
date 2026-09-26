# Share-to-Skriuw target

The platform half of quick capture (`apps/docs/content/v2/specs/mobile-app.md`, R-F8). Both
platforms write the same record into the same durable inbox that
`../file-inbox.ts` reads, so the application drains one queue however a
capture reached it.

| File | Role |
| --- | --- |
| `plugin.js` | Expo config plugin: installs the Android target at prebuild. |
| `android/ShareCaptureActivity.kt` | The Android trampoline: queue, then open the journal. |

## The contract between the halves

- One JSON object per line, appended, never rewritten in place.
- `{ id, text, title, dateKey, source, capturedAt }`, decoded by
  `../capture-record.ts`. An unfinished line is skipped, not fatal.
- Android writes `filesDir/skriuw-capture-inbox.jsonl`, which is what
  expo-file-system calls the document directory.
- iOS would write the same file inside the `group.dev.skriuw.app` App Group
  container, which `file-inbox.ts` already prefers when it exists.

A record leaves the file only once the workspace has acknowledged the write,
so a capture made while the workspace is locked, closed or still opening is
retried on the next launch rather than dropped.

## iOS

Not implemented. An iOS Share Extension is a second Xcode target plus an App
Group entitlement on both halves; adding it is a change to `plugin.js` and a
`ios/` directory beside `android/`, with no change to the queue, the drain or
the journal. Until then iOS captures come from inside the application only.
