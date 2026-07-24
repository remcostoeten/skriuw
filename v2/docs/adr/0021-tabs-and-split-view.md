# ADR-0021: Tabs and split view

- Status: accepted
- Date: 2026-07-24

## Context

The product ships with one active note and one persistent ProseMirror editor host by deliberate decision (ADR-0020): "one persistent direct ProseMirror view" and "the application shell and persistent editor host hold no workspace subscription" are measured, load-bearing performance properties. The bounded-editor acceptance gate (`docs/benchmarks/2026-07-22-product-bounded-editor.md`) proves one editor host and one editor instance survive 100 note switches.

Tabs and split view (`docs/specs/tabs-and-split-view.md`) require more than one note to be *open* at once, and — for split view only — more than one note to be *live* at once. This changes a documented architectural invariant, so the spec requires an accepted ADR before implementation.

## Decision

### Open is cheap; live is bounded at two

A tab holds note identity only: an ID in a list, a title looked up from the existing store projection. Opening a tab mounts nothing, allocates no editor, performs no IPC. The single-live-editor invariant is relaxed to exactly this: **at most one live editor per visible pane, and at most two visible panes.** With N tabs open and no split, there is still exactly one live ProseMirror view — the C2-measured fast-switch machinery is untouched, and switching the active tab *is* the already-budgeted note switch. Split view doubles steady-state editor cost only because there are genuinely two visible editors; background tabs must never regress steady-state performance.

Unfocused tabs render nothing (no cached static preview in v1). Closing a background tab is a pure state update — the editor it never had needs no teardown.

### One tab strip plus "open beside", not two independent tab strips

v1 ships the spec-recommended shape: a single tab strip owned by the primary pane, and an "open beside" action that shows a second pane with one note. The state model is nevertheless a generalized ordered pane list (`panes: PaneState[]`, length 1 or 2, each pane owning `openNoteIds` and an `activeNoteId`) so promoting the secondary pane to a full tab strip later is a UI change, not a model change. The same note may be open in both panes.

### The primary pane's active tab is `activeNoteId`

The store's existing `activeNoteId` *is* the primary pane's active tab. Every existing path — sidebar click, command palette, reference navigation, prev/next note — keeps its current behavior and implicitly drives pane 1: activating a note that is not open replaces the primary pane's active tab in place (reuse-active-tab default), never accumulating tabs. Opening a *new* tab or opening beside is explicit and opt-in (context menu, command palette, rebindable shortcuts). The metadata panel, editor save path, and history stay bound to `activeNoteId` unchanged.

The secondary pane's active note lives only in pane state and has its own live editor bound by a pane-specific selector. `NoteEditor` gains an optional note-ID selector prop defaulting to `activeNoteId`; the component is otherwise instance-self-contained, so two mounted instances do not share views, caches, or save timers.

### State ownership: native UI state, N4 precedent

Which notes are open, their order, and pane focus are native UI state like sidebar expansion — not workspace content. Persistence follows the sidebar-expansion mechanism exactly: synchronous local store update, coalesced background acknowledgement through a sibling binder, stored in `app_state` under `workspace_ui_panes`, restored on desktop restart, pruned against existing notes on load, and **excluded from portable archives** (archive export reads nodes, documents, settings, and the active note only; it never exports this key).

### Unavailable notes degrade visibly, reusing the trash projection

A tab whose note is purged is dropped from the strip during state derivation (the note row no longer exists). A tab whose note is trashed stays in the strip, labeled from the last known title with a trashed affordance; its pane resolves to the empty-editor state through the same `unavailableNodeIds`-derived projection that already governs sidebar visibility. No new trash-visibility logic is introduced.

## Consequences

- ADR-0020's "one persistent editor host" invariant is amended to "one live editor per visible pane, at most two visible panes"; all other ADR-0020 guarantees stand.
- The tab strip renders only when it carries information (more than one tab, or split active), so a single-note workspace looks and performs exactly as before.
- The C2 acceptance instrumentation gains one assertion: with N tabs open and no split, exactly one editor instance exists.
- Shortcuts (open in new tab, close tab, next/previous tab, open beside, close split) route through the existing rebindable shortcut system; nothing is hardcoded.
- The secondary pane in v1 has no tab strip of its own; promoting it later requires UI work only.
