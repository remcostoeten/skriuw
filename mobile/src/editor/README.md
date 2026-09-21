# Editor host

The one warm editor webview and the host half of the editor protocol
([mobile-app spec](../../../docs/specs/mobile-app.md), R-F2, R-P2, R-P3;
[ADR-0048](../../../docs/adr/0048-native-mobile-shell-over-shared-core.md)).

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
`app/src/features/editor-standalone`, not a module Metro can compile. The DOM
component therefore embeds it as a **same-origin** document and relays protocol
messages, the same shape the browser harness proved in
`app/harnesses/editor-host`. Same-origin is a requirement: `transport.ts`
inside the page posts to `window.location.origin` and answers only its own
origin.

## Wiring it up

`NotesColumn` in `mobile/src/shell/route-views.tsx` mounts `EditorHost` and
subscribes only to whether a note is open. Switching notes is a `load` into
the same webview; leaving the notes route unmounts it, because the column
lives inside the route slot.

Still outside this directory:

1. The built editor page must be packaged and served from the DOM component's
   origin, and `EXPO_PUBLIC_SKRIUW_EDITOR_ENTRY` must point at it. Until then
   the host shows the note read-only (`read-only-document.tsx`) with the
   `bundle-missing` notice instead of a blank webview.
2. Keeping the webview warm across routes (R-P2) needs `shell-frame.tsx` to
   mount `<EditorHost visible={route === "notes"} />` once beside the route
   column, and `NotesColumn` to stop mounting its own.

## Checks

`scripts/check-mobile.sh` typechecks this directory and runs the `.cts`
suites in `__tests__`, including the Mobile 16 invariants: no bridge call
across 100 note switches and no synchronous bridge call across 60 changes.
