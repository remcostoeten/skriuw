# ADR-0041: The compact shell is one column with sheets, a tab bar, and touch-owned gestures

- Status: accepted
- Date: 2026-09-15

## Context

The workspace shell is a four-track grid: rail, tree, editor, inspector. On a
phone the first three already exceed the viewport and the inspector renders off
screen, with no way to dismiss either panel. Pointer affordances carry the same
problem: reordering is a drag, the item menu is a right click, hover reveals
close buttons, and 28px rows are below any touch target guideline.

ADR-0040 made the browser build installable. Installed on a phone, it has to
behave like an application on that phone, and the desktop layout cannot be
squeezed into one.

## Decision

Below 768px the shell switches to compact mode, decided once by a media query
at the top of the shell rather than per component. Compact mode:

- Collapses the grid to one content column over a bottom tab bar that carries
  the rail's destinations plus the account trigger, so settings stay one tap
  away on every route.
- Moves the tree and the inspector into edge sheets that overlay the editor.
  A sheet is a labelled modal dialog with its own close control; it also closes
  on scrim tap, Escape from inside it, a pull toward its edge, and, for the
  tree, on picking a note or a journal day, because that pick is the errand
  the sheet was opened for. The page behind an open sheet is inert. Sheets are
  not native `<dialog>` modals because menus portal to `document.body`, which
  a modal dialog would render inert.
- Opens sheets from the screen edges through two thin strips with
  `touch-action: none`. Browsers claim a touch as a pan after a few pixels and
  cancel pointer events, so an edge gesture recognised on the content itself
  never completes; the strips keep the touch. `touch-action: pan-y` on the
  whole shell was rejected because it disables every horizontal scroller
  inside the app.
- Applies the phone panel policy on entry (tree offered only when no note is
  active, inspector closed) and restores the desktop panel state on exit.
- Stacks split panes regardless of the stored orientation.

Touch owns a different gesture set on the tree, decided by `pointerType`
rather than by mode, so a touch screen on a laptop gets it too:

- A held row opens the same menu a right click does. Android already fires
  `contextmenu` on a long press; iOS never does, so a 450ms timer dispatches
  the event itself and the native path cancels the timer.
- A pull left past 96px trashes the row on release with the existing undo
  toast; the row follows the finger and resists past the threshold.
- A vertical pull is the list scrolling and cancels both.
- Drag reordering is pointer-only. The menu carries Move to, and a touch drag
  cannot be told from a scroll without a hold that already means the menu.

The compact shell is sized from the visual viewport, not the layout viewport:
sheets take `--viewport-top` and `--viewport-height`, so an open keyboard
shrinks them above it rather than hiding their lower half, and the tab bar
leaves while the keyboard is up, the way a native tab bar does. The text
formatting popover has no room beside a selection on a phone and the native
selection handles already sit there, so it docks at the bottom of the visual
viewport as a sideways-scrolling bar, above the tab bar or on the keyboard's
top edge. Inputs are at least 16px under a coarse pointer, because iOS zooms
into anything smaller on focus. The editor's hover gutter (insert, drag grip)
is hidden where hover does not exist: it lives in the margin the edge strip
occupies, and block moves are pointer-only.

Rows, menu items, and tab bar items grow to 44px under a coarse pointer. Hover
revealed controls become always visible. A vibration API, where one exists,
ticks when a hold opens the menu, when a swipe crosses the delete threshold,
and when a sheet snaps closed; nothing depends on it firing, because iOS has
none.

## Consequences

The compact shell is a second layout of the same components, not a second
application: `Sidebar`, `MetadataPanel`, and every route view render unchanged
inside the sheets and the single column. Route views that place themselves in
desktop grid columns are collapsed into column one by the compact stylesheet,
so a new route needs no mobile-specific placement.

Gesture recognition is pure and unit tested (`shell/edge-swipe.ts`,
`features/sidebar/touch-gestures.ts`); the DOM wiring around it is covered by
`app/e2e/mobile-shell.mjs`, which drives a 390px touch-emulated Chrome against
the hermetic harness.

Escape has a layering rule: a sheet acts on it only when it originates inside
the sheet or on the page, so a menu or dialog stacked above keeps its own
Escape. Any new overlay must respect that by handling Escape before it reaches
the document.
