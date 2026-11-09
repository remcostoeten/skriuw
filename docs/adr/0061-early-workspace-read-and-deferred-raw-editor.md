# ADR-0061: Early workspace read and a deferred raw editor chunk

- Status: accepted
- Date: 2026-11-09

## Context

Desktop startup measured on a 582-note workspace spends its time in the web
view, not in Rust: the shell's `setup` takes about 7 ms. The renderer asked
for the bootstrap snapshot only after the bundle had loaded and evaluated and
its startup listeners were registered.

The snapshot request could not simply move earlier. The renderer subscribes to
history and sync events before it reads the snapshot so a change published
during startup is not lost (see `app/history-startup.ts` and
`app/sync-startup.ts`). A snapshot read before those listeners exist would miss
any change published between the read and the subscription.

The main chunk also carried CodeMirror, its vim layer and the Lezer parsers,
which only the raw Markdown editor uses.

## Decision

`index.html` starts the snapshot, sidebar-expansion and pane-layout reads in an
inline script, before the bundle is fetched. The snapshot comes from
`bootstrap_workspace_at_epoch`, which returns `[epoch, snapshot]` JSON by
wrapping the snapshot text the storage worker already encoded. The shell
counts every history header and synced workspace change it publishes in a
`WorkspaceEventEpoch`, and reads the epoch before it reads the snapshot. Once
the renderer is listening it calls `workspace_event_epoch`. Equal epochs mean
no change was published between the read and the subscription, so the early
snapshot is used. Different epochs, or a failed early read, fall back to an
ordinary `bootstrap_workspace` call made after subscribing, which is the
previous behaviour. The early reads are handed over once; a retried startup
reads again.

The raw Markdown editor moves into its own chunk behind
`features/editor/raw-markdown-editor-loader.tsx`. When the first screen shows a
raw note (the editor's default mode is raw, or a pane's active note renders
raw), startup loads it before the first render. Otherwise
`warmEditorRenderers` starts the load right after the first commit, beside
KaTeX and Mermaid.

## Consequences

- The performance contract's rule against editor chunk loading after startup
  gains one exception. The raw editor's load always starts during startup,
  never on demand, but a raw note opened between the first commit and the end
  of that load renders nothing until the load finishes.
- Startup issues one extra small IPC call (`workspace_event_epoch`). A change
  published during startup costs a second snapshot read, which is what every
  startup cost before.
- The browser runtime is unchanged: the inline script does nothing without the
  Tauri bridge, and the browser reads the workspace through its worker as
  before.
- On top of the startup work in #572 the snapshot is ready earlier, but the
  time to first paint is unchanged, because a main-thread task of about
  250 ms on the WebKit side now fills the gap. See
  [the measurement](../benchmarks/2026-11-09-desktop-startup.md).
- The early read changes when data arrives, not how much. Sending note bodies
  after first paint would conflict with the rule that navigation never waits
  on IPC, and is not part of this decision.
