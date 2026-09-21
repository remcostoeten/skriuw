# Editor host harness

Proves the standalone editor bundle (`apps/workspace/src/features/editor-standalone`) against the
host protocol (`apps/mobile/src/editor/protocol.ts`) in a browser, before any device work
(Mobile 05, [mobile-app spec](../../../docs/specs/mobile-app.md), ADR-0048).

`host.html` plays the native host: it owns eight notes, embeds `editor.html` in an iframe
and speaks only protocol messages to it. Every `change` is made durable in memory and
acknowledged with the next revision, or refused with a revision conflict.

## Run

```bash
cd app
node harnesses/editor-host/scripts/run.mjs
```

The script builds the bundle, serves it with `vite preview` on
`SKRIUW_EDITOR_HOST_PORT` (default 4197), and drives a headless Chrome
(`CHROME_BINARY`, default `google-chrome-stable`) at 390 × 844 with touch emulation.
Raw results land in `results/latest.json`.

For manual work: `bunx vite --config harnesses/editor-host/vite.config.ts`, open
`/harnesses/editor-host/host.html`, and drive `window.__EDITOR_HOST__` from the console
(`load("note-2")`, `setTheme("paper")`, `publishReferences()`, `setAckMode("conflict")`).

## What it proves

- The first message is a versioned `ready`; loading makes no request beyond the bundle's own files.
- load A → type → load B → load A shows A's edits; the two `change` messages are ordered and the
  second is made against the revision the first acknowledgement returned.
- 200 alternating loads keep the one original ProseMirror view, a flat element count and a
  bounded heap, and emit no `change`.
- `theme` and `remote-change` update the mounted view without a reload.
- The slash menu and the bubble menu open, fit the 390 px viewport and act on touch taps.
- A message from another protocol version is refused with a bounded `failure`.

## How the port is injected

The editor feature is not forked and takes no new props. Everything it reaches outside the
store funnels through two modules, `@/bridge/runtime` (`invoke`) and `@/bridge/external-links`.
`vite.config.ts` swaps both for protocol-backed stand-ins at resolve time:

| Editor reaches for | Becomes |
| --- | --- |
| `apply_workspace_operations` | one `change` per commit, settled by `ack` |
| `bootstrap_workspace` after a rejected commit | the last acknowledged documents, held in the session |
| media reads and writes, any other command | `request` / `response`, bytes as base64 |
| external links | `open-link` |
| activating a note link | `navigate`; the loaded note stays on screen until the host sends `load` |
| mention search, link titles, chip colours | the store tables the host pushes with `references` |

`change` follows ADR-0012 on the renderer side of the seam: a group of operation envelopes leaves
the moment the editor commits, in order, never coalesced or dropped, and each group gets its own
acknowledgement. Forming bounded batches stays where the ADR put it, in the runtime behind the host.

## Bundle size

Production build, 2026-09-19, Vite 8.1.5 (`results/latest.json` lists every file):

| Part | Bytes | Gzip |
| --- | ---: | ---: |
| Eager JavaScript (entry and every module-preloaded chunk) | 1,341,694 | 435,293 |
| Stylesheet | 227,453 | 36,405 |
| Lazy AI and dictation chunks (never requested while AI is off) | 182,646 | 57,566 |
| Total emitted | 1,753,899 | 530,308 |

The total includes the harness page's own 2 kB script (`host-*.js`).

## Limits

Headless Chrome on one Linux machine. Touch is CDP-emulated; the selection that opens the bubble
menu is set through the DOM because CDP cannot long-press-select. No WebKit, no Android System
WebView, no iOS, no real software keyboard. The React Native webview transport in
`transport.ts` is written against the documented bridge and has not run on a device.
