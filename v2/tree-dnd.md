# Prompt: Drag-and-drop for the sidebar tree

Add drag-and-drop move/reorder to the sidebar workspace tree in
skriuw (/home/remcostoeten/dev/skriuw-standalone,
`app/src/shell/sidebar.tsx`). Work end-to-end without asking for
permission.

## Non-negotiable: existing interactions keep working

The tree already has a full keyboard/mouse interaction model. DnD is
ADDITIVE. Regressing any of these is a failed implementation:

- Arrow Up/Down roving focus (wraps at ends), Arrow Left/Right
  collapse/expand + parent/child navigation, Enter activate/toggle,
  F2 rename, Delete trash, Alt+ArrowUp/Down sibling reorder.
- Ctrl+click / Shift+click multi-select (`state.selectedNodeIds` in
  the renderer store; SidebarRow renders bit 4 of its status mask).
- Roving tabindex + `role="tree"`/`treeitem` semantics,
  `aria-selected`, focus-follows-click.
- The single shared context menu (rows carry `data-row-key`; do not
  mount per-row menus).
- The virtualized window: rows are absolutely positioned, only ~80
  render, scroll state is quantized to row pitch (`treeScrollRow`).
  Your drop-indicator math must work in window coordinates
  (`(treeWindow.start + position) * rowPitch`), and auto-scroll during
  drag must go through the element's `scrollTop` so the quantized
  state stays consistent.

## Behavior spec

1. **Drag sources**: any row. If the dragged row is part of the
   current multi-selection, drag the whole selection; otherwise drag
   just that row (and do not clear the selection).
2. **Drop targets**:
   - between two rows → reorder: `moveNode(store, id, { parentId,
     position: { type: "before" | "after", anchorId } })` — the action
     already exists in `app/src/actions/workspace.ts`,
   - onto a folder row (middle band of the row) → move inside:
     `position: { type: "last" }`,
   - root gap below the last row → move to root.
3. **Indicators**: a 2px insertion line between rows (indented to the
   target depth) and a highlight ring on folder rows for drop-inside.
   Plain CSS in `app/src/css/sidebar.css` using existing tokens.
4. **Hover-to-expand**: hovering a collapsed folder for ~700ms during
   a drag expands it (`store.toggleExpanded`).
5. **Auto-scroll**: dragging near the top/bottom edge of the tree
   viewport scrolls it (rAF loop, speed proportional to edge
   proximity; cancel on drop/leave).
6. **Validity**: never allow dropping a node into its own subtree
   (`isInSubtree` already exists in sidebar.tsx) or onto itself;
   invalid targets show no indicator and drop is a no-op. Multi-drag
   filters out nodes whose ancestor is also in the drag set (moving
   the ancestor is enough).
7. **Escape cancels** an in-flight drag.

## Implementation notes

- Use native HTML5 drag events (`draggable`, `onDragStart/Over/Drop`,
  `dataTransfer` with a custom mime like
  `application/x-skriuw-nodes`). No DnD library — the repo has a
  no-new-deps rule. Verify native DnD behaves in the Tauri webview
  (WebKitGTK on Linux) early; if it's unreliable there, fall back to
  pointer-event-based dragging (pointerdown + pointermove threshold +
  pointerup), still honoring every requirement above. State that
  choice and why in your summary.
- Hit-testing: reuse the `data-row-key` + `closest()` pattern the
  shared context menu uses. Row Y → zone (top 25% = before, bottom
  25% = after, middle = inside for folders; for notes it's a 50/50
  before/after split).
- Keep drag state in refs + one small `useState` for the indicator
  (id + zone) so per-pixel dragover does NOT re-render the tree —
  same discipline as the quantized scroll state. Only setState when
  the indicator target/zone changes.
- Persist through the existing operation pipeline only (`moveNode` /
  `commitOperations`); never mutate store state directly. Multi-moves
  should batch into one `commitOperations` call if the action layer
  allows, so undo/ack is atomic.
- SidebarRow is memoized with stable props — pass drag handlers as
  stable references (module-level or ref-backed), not fresh closures,
  or you'll defeat the memo on every Sidebar render.

## Conventions

`function` declarations for standalone fns, arrow callbacks,
kebab-case filenames, no explanatory comments (a why-comment for any
webview quirk workaround is allowed), no empty catches (`noop` from
`app/src/shared/lib/`), tests in `app/__tests__/`.

## Definition of done

- Unit tests for the pure parts: zone hit-testing math, drag-set
  ancestor filtering, subtree-drop rejection, indicator indent depth.
- All existing sidebar/keyboard/multi-select tests still pass
  unchanged: `cd app && pnpm typecheck` exit 0, `pnpm test` all pass.
- Manual check in `pnpm tauri:dev`: drag a note between folders, drag
  a folder into a folder, multi-select 3 nodes and drag them, attempt
  to drop a folder into its own child (must refuse), drag to the
  bottom edge and watch auto-scroll, press Escape mid-drag, then
  verify Alt+ArrowUp/Down and Ctrl/Shift+click still behave exactly
  as before.
- Summarize what you built. Do not commit unless asked.
