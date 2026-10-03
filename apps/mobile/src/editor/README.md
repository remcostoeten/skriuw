# Editor host

The one warm editor webview and the host half of the editor protocol
([mobile-app spec](../../../../docs/specs/mobile-app.md), R-F2, R-P2, R-P3;
[ADR-0048](../../../../docs/adr/0048-native-mobile-shell-over-shared-core.md)).

| File | Owns |
| --- | --- |
| `protocol.ts` | The message contract, shared with the editor bundle (Mobile 05). |
| `host-messages.ts` | Validates what the webview sends; the webview is untrusted input. |
| `host-session.ts` | The host itself: load on note switch, commits, acknowledgements, references, remote changes, requests, recovery. No React. |
| `editor-surface.tsx` | The `'use dom'` component: the webview and the relay to the page inside it. |
| `editor-host.tsx` | The React Native host: mounts the surface once, keyboard avoidance, the recoverable surface. |
| `read-only-document.tsx` | The note as text, for builds that carry no editor page. |
| `bundle-source.ts`, `bytes.ts`, `failure-view.ts` | Where the page is served from, the `EditorBytes` codec, the failure model. |

## Shape

`EditorHost` is mounted once by the shell and never unmounted. Hiding it keeps
the webview warm, so returning to a note costs a layout pass and no page load.
Switching notes is a `load` message; nothing in React re-renders from a
keystroke, because documents, acknowledgements and references travel through
`createEditorHostSession` as plain store subscriptions.

The editor is the desktop bundle, unforked: a Vite build of
`apps/workspace/src/features/editor-standalone`, not a module Metro can compile. The DOM
component therefore embeds it as a **same-origin** document and relays protocol
messages, the same shape the browser harness proved in
`apps/workspace/harnesses/editor-host`. Same-origin is a requirement: `transport.ts`
inside the page answers only its parent frame on its own origin.

## Wiring it up

`ShellFrame` in `apps/mobile/src/shell/shell-frame.tsx` mounts `EditorHost`
once, beside the route slot, and shows it while the notes route has a note
open. Switching notes is a `load` into the same webview, and leaving the notes
route hides it without unmounting it. `NotesColumn` only covers the slot while
no note is open.

## Packaging the editor page

`bun run editor:page` builds the page with
`apps/workspace/harnesses/editor-host/vite.mobile.config.ts` into
`apps/mobile/public/editor/` (gitignored). Expo copies `public/` into
`www.bundle/`, beside the DOM component's own page, when it embeds a release
build, and the dev server serves it at its root. `apps/mobile/.env` sets
`EXPO_PUBLIC_SKRIUW_EDITOR_ENTRY=editor/editor.html`; `bundle-source.ts`
resolves it relative to the DOM page in release builds and from the root on
the dev server.

- `bun run export:android` and `bun run export:ios` build the page, then export.
- EAS builds it in the `eas-build-post-install` hook.
- Local release builds (`expo run:android --variant release`) and the dev
  server need `bun run editor:page` once first, or the webview shows a blank
  frame.

Release builds load DOM pages from `file://`, so the page ships one classic
deferred script instead of ES modules, and the frame channel matches on
`event.source` alone there, because a `file://` sender's origin is `"null"`
(`frameMessageOrigin` in `protocol.ts`). The native webviews inject
`window.ReactNativeWebView` into every frame, so the framed page ignores it and
talks to its parent.

Without an entry, the host shows the note read-only (`read-only-document.tsx`)
with the `bundle-missing` notice instead of a blank webview.

## Checks

`bin/check mobile` typechecks this directory and runs the suites in
`__tests__/apps/mobile/src/editor/`, including the Mobile 16 invariants: no bridge call
across 100 note switches and no synchronous bridge call across 60 changes.
