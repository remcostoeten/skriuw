# ADR-0060: A bounded note renders its viewport first and grows its window when idle

- Status: accepted
- Date: 2026-11-06
- Amends: the bounded-window fallback in [ADR-0020](0020-ui-architecture.md)

## Context

ADR-0020 renders a note above 192 top-level blocks as a 192-block window of
one canonical document. Opening such a note installs the whole window in the
navigation task, and the focus and DOM selection that follow force a
synchronous layout of every block in it. The 2026-10-17 release baseline
failed `selectionDispatch`, `coldEditorRevisit` and
`navigationMainThreadTask` on the 500- and 2,000-block fixtures, and a trace
of the 2,000-block keydown put the window's layout at about 3.7 ms, with
1.6 ms of style recalculation on top.

Two smaller findings belong to the same measurement:

- The harness builds against `react-dom/profiling`, which writes a
  `console.timeStamp` per component and commit while a trace records. That
  was about 4.5 ms of every traced keydown, and the production build has
  none of it.
- The `caret-color` rule that hides WebKitGTK's lingering caret is
  inherited, so every focus change between the sidebar and the editor
  restyled each rendered block.

The window model also assumed it always held 192 blocks. An edit that added
a block left the editor one block ahead of the model, and the next edit
copied the block past the window's end into the note. Deleting blocks at the
end of a note moved the model's window off the blocks the editor showed.

## Decision

A bounded note opens with a window just large enough to fill the viewport,
and grows to the full 192-block window during idle time.

- **The window tracks what the editor renders.** The model keeps a start and
  a rendered size. A window edit sets the size to the editor's block count
  and never moves the start, so model and editor cannot drift.
- **Narrow on navigation.** Showing a bounded note picks a focus block: the
  block that was at the top of the viewport when the note was last scrolled,
  or the start of the full window. The rendered window starts there and holds
  `ceil(viewport height / 20 px) + 4` blocks, at least 16. The full window
  that would have been rendered stays as the target; if the focus block lies
  outside it, the target is recentred on the focus block.
- **Grow when idle.** Idle callbacks (a zero-delay timeout where
  `requestIdleCallback` is missing, as in WebKit) add up to 32 blocks per
  step, below the window first and then above it, until the target is
  rendered. Each step is one ProseMirror transaction applied with
  `updateState`, outside `dispatchTransaction`, marked `addToHistory: false`.
  It records no undo entry, schedules no save and renders no React.
- **Growth never moves what is on screen.** Before blocks are inserted above
  the viewport, the first rendered block's position is read; after the
  insertion it is read again and the scroll position absorbs the difference.
  Browser scroll anchoring is switched off on the scroll host for that one
  step so the shift is corrected exactly once.
- **Restore by block, not by pixel.** The scroll handler records the first
  block intersecting the viewport and its offset from the top. Showing the
  note again scrolls that block back to that offset; the spacer height above
  the window is an estimate, so an absolute `scrollTop` would land elsewhere
  once the window starts at a different block. A note that was never scrolled
  restores its `scrollTop` as before.
- **Selection waits for its block.** A remembered caret outside the initial
  window is applied by the growth step that renders its block, unless the
  selection changed since the note was shown.
- **Interaction outranks idle time.** Arrow keys and Vim `j`/`k` at the edge
  of a partial window render the remaining growth synchronously first. A
  window move, a reveal outside the window, or an undo that rebuilds the
  window use the existing 192-block path and drop pending growth.
- **Growth pauses** during IME composition and block drags and resumes after.
- **WebKit only.** The `caret-color: transparent` rule for a blurred editor
  applies only when the editor root carries `data-native-caret-lingers`,
  which is set on WebKit engines.
- **The harness measures the shipped React build.** It removes
  `console.timeStamp` before `react-dom` loads, reports growth steps
  separately from editor installation, and requires a large note's window
  to grow back to 192 consecutive blocks.

## What stays the same

Canonical range reconciliation, the compact grouped undo history, find and
replace and clipboard output over the full document, deferred IME movement,
the whole-document reader for accessible traversal, and remote reconciliation
all keep operating on the canonical document. The editor's accessible label
names the target window, so it does not change while the window grows. Notes
with up to 192 blocks are rendered whole, exactly as before. The editor view
is still created once and never remounted, navigation still makes no IPC,
database read or Markdown parse, and typing still renders no React.

## Consequences

- The navigation task lays out about 50 blocks instead of 192 on a typical
  viewport. The 192-block layout moves into idle steps of under 2 ms each.
- For a few frames after a switch, blocks far below or above the viewport
  are not in the DOM yet. Browser find-in-page and screen-reader virtual
  cursors see the partial window until growth completes; the full-note reader
  is unaffected.
- A note left scrolled shows the same block at the same offset, but the
  scrollbar thumb can sit slightly differently, because the spacer above the
  window is estimated at 32 px per block.
- Measurements for this decision are in
  [`docs/benchmarks/2026-11-06-progressive-bounded-window.md`](../benchmarks/2026-11-06-progressive-bounded-window.md).
