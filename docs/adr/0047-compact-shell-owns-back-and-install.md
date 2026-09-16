# ADR-0047: The compact shell owns the back gesture and the install offer

- Status: accepted
- Date: 2026-09-16

## Context

ADR-0040 made the browser build installable and ADR-0041 gave it a phone
layout. Installed on Android, three platform behaviours still read as a
website:

- The back gesture navigated the hash history. With a sheet or the settings
  dialog open it left the overlay on screen and moved the route underneath,
  and from the first route it left the app.
- Every tab bar tap pushed a history entry, so back replayed each tab visited
  before it could leave.
- The browser's install offer (`beforeinstallprompt`) went to the browser's
  own banner, while the storage warning told the user to install without
  giving them anywhere to do it. Chromium fires that event once per load and
  only shows the banner when nothing claims it.

## Decision

Overlays in the compact shell each own one history entry. Opening a sheet,
dialog, or palette pushes a state entry without changing the URL; the back
gesture pops it and closes the overlay on top, leaving the route alone.
Closing any other way pops the entry again, so the stack never carries an
overlay that is no longer on screen. Two cases keep that honest: an overlay
that closed under a newer navigation leaves its entry buried, and that entry
is skipped when a later back lands on it; and an overlay opened while a pop is
still in flight defers its push until the pop completes, because a push made
before then would be undone by it. The recogniser is pure and unit tested
(`shell/overlay-history.ts`); the wiring lives in the sheet and the shared
`<dialog>` primitive and applies only under the compact query, so a desktop
browser's back keeps meaning navigation.

Tab bar taps replace the current entry instead of pushing one, the way a
native tab bar switches destinations. `replaceState` fires no `hashchange`, so
one is dispatched by hand and every hash subscriber sees the same event as a
push.

Home-screen shortcuts and the share target are handled by launch capture
(`features/capture/launch-capture.ts`), which reads its errand from the query
string for the same reason: shortcut URLs are resolved before the renderer
can read a hash. This decision leaves that mechanism as it is.

The renderer claims the install offer and puts it where the user already is:
the account menu, the Data settings section, and the storage warning itself,
which gains an Install action when an offer is held. Safari never fires the
event, so nothing may depend on the offer existing.

Dialogs are sized from the visual viewport rather than `100vh`, and settings
fills the phone edge to edge with the safe areas applied to the dialog
itself, because a top-layer element sits outside the body padding that
carries them. Under a coarse pointer the styled scrollbar is hidden so the
platform's overlay indicator shows, and toasts sit above the tab bar.

## Consequences

Back closes what is on top, then leaves the app, on every phone that has a
back gesture; iOS standalone has none and nothing changes there. A
forward-navigation after closing an overlay lands on a skipped entry and is
bounced back, which is accepted: forward has no native meaning inside an
installed app.

A navigation that happens between an overlay's close and its history pop, in
the same task, could be undone by that pop. The renderer's overlays navigate
before they close, so the ordering holds today; a new overlay that navigates
during unmount must keep it.

The compact e2e (`app/e2e/mobile-shell.mjs`) drives the back gesture, the
tab bar, and the settings dialog through CDP navigation history, which
reports the current index where `history.length` cannot once forward entries
exist.
