# 0043 — Below phone width the panels are touch-driven edge drawers

## Status

Accepted, 2026-09-14.

## Context

The shell is a four-track CSS grid: rail, sidebar, main, metadata. It has no
breakpoint, so on a phone the grid is simply wider than the screen: the rail
and sidebar take most of the viewport, the note is a sliver on the right, and
the metadata panel is off-screen with no way to reach it. The only way to
change what is visible is the toolbar toggle, which snaps a track to zero
width; there is no gesture, no scrim, and nothing that follows a finger.

The same shell serves the browser runtime on a phone and a narrow desktop
window, so the fix has to be a layout mode of the one shell, not a second
mobile application.

## Decision

Below `COMPACT_SHELL_QUERY` (767px) the shell enters a compact mode:

- The grid collapses to one main column. The rail and sidebar become one
  left-edge drawer and the metadata panel a right-edge drawer, positioned
  absolutely over main and moved with `transform`. A scrim covers main while
  a drawer is open; tapping it closes both.
- Drawers start closed on entry to compact mode. On a coarse pointer the
  sidebar drawer closes itself when the active note or route changes: picking
  something is the drawer's job done. A narrow desktop window keeps it open,
  because a closed drawer is inert and would throw keyboard focus out of the
  tree mid-navigation.
- A horizontal touch swipe anywhere in the shell drags the drawer it would
  reveal, or the drawer that is open. Motion is 1:1 with the finger. Dragging
  past fully open stretches with UIKit's rubber-band curve and springs back.
  On release a flick settles in its own direction; a slow release lands on
  the nearer rest position.
- The swipe yields to anything that already owns horizontal motion under the
  finger: range inputs, regions with `touch-action: none` or `pan-x`, and
  scrollers that can still move in that direction. A long press before the
  first move is a selection, not a swipe. Vertical intent hands the gesture
  back to the browser.
- The drag paints through custom properties on the shell container and never
  renders React until the finger lifts, in line with the performance contract.
  Rest positions come from data attributes React sets; the inline drag
  position is released once the settle transition has run.
- Routes without a sidebar (trash, history, tags, people, tasks) get a
  floating toggle so the rail, which lives in the left drawer, stays
  reachable without knowing the gesture.
- Sidebar row drag-and-drop ignores touch pointers. It began on any 4px move,
  which made every touch swipe on the tree a row drag; touch reorder had no
  long-press affordance and was cancelled by the browser's own scroll anyway.

The physics live in `app/src/shell/drawer-physics.ts` as pure functions with
unit tests; the gesture wiring in `app/src/shell/drawer-gestures.ts`; the
layout in `app/src/shell/compact.css`.

## Consequences

- The desktop grid, resize handles, and persisted widths are untouched above
  the breakpoint. The persisted widths still size the drawers, capped so a
  strip of main always shows.
- Mouse drags do not move drawers: the gesture is touch-only so a narrow
  desktop window keeps text selection intact. The toolbar toggles still work.
- Split editor panes and the views' own internal layouts are not adapted for
  phone width by this decision.
- The viewport declares `viewport-fit=cover`; the compact shell pads by the
  safe-area insets so the drawers and toolbar clear the notch and home
  indicator on iOS.
