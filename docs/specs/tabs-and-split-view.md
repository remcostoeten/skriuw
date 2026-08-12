# Tabs and split view

Status: not started. Low priority — the app currently has one active note and one persistent editor host by design; this spec is the largest architectural departure in the post-v1 backlog and should not be started casually.

## Goal

Let a user have more than one note open at once: multiple tabs across the top of the editor area, and/or a split view showing two notes side by side. Both features share the same underlying change (more than one concurrently-mounted, concurrently-live editor) and should be designed together even if shipped separately.

## Why this is not small

Read `ARCHITECTURE.md` before starting: "The product uses one persistent direct ProseMirror view" and "The application shell and persistent editor host hold no workspace subscription" are load-bearing performance decisions, not incidental ones. C2's bounded-editor work (`docs/benchmarks/2026-07-22-product-bounded-editor.md`) measured "one editor host and one editor instance survive 100 switches between whole-document and bounded notes" as an explicit acceptance gate. Multiple simultaneously-live editors is a different problem than fast switching between them, and the existing single-host architecture does not generalize to it for free.

This feature requires a real decision, likely its own ADR, on at least:

- **How many editors are truly "live" (mounted ProseMirror views) at once** versus how many are "open" (in the tab bar / split, but backgrounded — showing cached last-rendered content, not a hydrated editor). Keeping every open tab as a fully live ProseMirror instance risks reintroducing exactly the per-switch cost the bounded-editor work eliminated. The likely-correct design: tabs/split panes hold note identity and scroll/selection state; only the focused pane(s) — at most 2, for split view — have a live editor instance at any moment; unfocused tabs render a cheap static preview or nothing until focused.
- **Whether split view is two independent panes** (each with its own tab strip, each can show any note, including the same note twice) **or one tab strip with a "open beside" action**. The former is more powerful and more work; the latter (closer to what most note apps ship first) is the recommended v1 of this feature.
- **State ownership**: which notes are open, in what order, and which pane/tab has focus is native UI state — like sidebar expansion (N4), not workspace content. It should follow N4's precedent: persisted natively, excluded from portable archives, restored on desktop restart.

## Renderer shape (proposed)

- `app/src/app.tsx` currently mounts one `<EditorHost store={store} />` (`app.tsx:194`). Introduce a `PaneLayout` concept above `EditorHost`: an ordered list of panes (1 for normal mode, 2 for split), each pane owning an ordered list of open note IDs (tabs) and one active note ID.
- Only the active note ID of each *visible* pane gets a live `EditorHost` mount. A pane with 8 open tabs but 1 visible does not instantiate 8 editors.
- Closing a tab that isn't the active one is a pure state update — no editor teardown needed since it was never mounted.
- Switching the active tab within a pane reuses the existing fast-switch machinery (C2) — this is exactly the "switch between notes" case that's already measured and budgeted; the new cost is only in split view, where two panes are live simultaneously, doubling steady-state editor-host cost (acceptable — it doubles because there are genuinely two visible editors, not because of overhead).

## Native/store state

Add to native UI state (same persistence path as sidebar expansion, `app/src/store/sidebar-expansion-persistence.ts` — extend or sibling it, don't reinvent the persistence mechanism):

```ts
type PaneState = {
  paneId: string;
  openNoteIds: string[];
  activeNoteId: string | null;
};
type WorkspaceUiState = {
  panes: PaneState[]; // length 1 (tabs only) or 2 (split)
  ...
};
```

Persisted the same way expansion is: synchronous local update, coalesced background acknowledgement, excluded from portable archives (opening a note in a tab is not workspace content).

## Interaction surface

- Keyboard: open note in new tab, close tab, next/previous tab, open-beside (split), close split — all through the existing rebindable shortcut system, not hardcoded.
- Closing a note that's trashed elsewhere while it's open in a tab: the tab must handle the note becoming unavailable gracefully (show a "moved to trash" state in that tab, matching how `unavailableNodeIds` already governs sidebar visibility — reuse that projection, don't duplicate the trash-visibility check).
- Command palette and sidebar single-click behavior needs a decision: does clicking a note in the sidebar always reuse the active tab (current single-note-open behavior), or open a new tab? Recommend: reuse active tab by default (current behavior preserved), with an explicit modifier or context-menu action ("open in new tab" / "open beside") for the new behavior — this keeps the common case unchanged and opt-in for the new one.

## Acceptance criteria

- With tabs enabled and 10 tabs open, only the active tab has a live editor instance — verified via the same render-count/editor-host-mount instrumentation C1/C2 already use. Covered at the unit level by `app/__tests__/shell/editor-panes.test.ts`, which renders `EditorPanes` with `react-dom/server` and asserts exactly one mounted editor host with N tabs and no split, and exactly two with a split open.
- Split view shows two independently-scrollable, independently-focusable panes; typing in one does not affect the other's scroll position or selection.
- Cached-switch and keystroke-to-paint budgets from `docs/performance-contract.md` hold for the active pane(s) with an arbitrary number of background tabs open — background tab count must not regress steady-state performance.
- Open tabs/panes and their order survive desktop restart.
- Open tabs/panes are absent from portable archive export.
- A note that becomes unavailable (trashed/purged) while open in a background tab does not crash or corrupt that pane; it degrades visibly.
- An ADR is written and accepted before implementation begins, given this changes a documented architectural invariant ("one persistent editor host").
