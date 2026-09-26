---
title: "Mobile accessibility pass, 2026-09-20"
description: "The R-Q2 pass for the mobile client: every screen is operable with VoiceOver and TalkBack; touch targets are at least 44 pt (Mobile app)."
---

**Neither screen reader was run.** VoiceOver needs an iOS device, which cannot
exist on this host (ADR-0048), and TalkBack needs an Android device or emulator,
which this host cannot boot — see
[the readiness document](/v2/benchmarks/2026-09-20-mobile-release-readiness#not-measured-and-why).
What follows is a mechanical audit of what the shell *exposes* — accessible
role, accessible name, and computed touch target for every control, on every
route and both overlays — plus a source review of the two React Native
properties screen readers depend on that a DOM audit cannot see. It finds
three defects. It cannot tell you how anything is announced.

## Method

`harness/mobile-web-audit.mjs` serves the static `expo export --platform web`
output at 390 × 844 with DPR 3 and touch emulation, visits every route, opens
the notes-tree sheet and the account panel, and records every rendered control
matching an interactive role. Raw report:
[`raw/2026-09-20-mobile-web-audit.json`](https://github.com/remcostoeten/skriuw/blob/daddy/tools/benchmarks/raw/2026-09-20-mobile-web-audit.json).
Reproduction: [`harness/README.md`](https://github.com/remcostoeten/skriuw/blob/daddy/tools/benchmarks/harness/README.md).

React Native Web renders the same components with the same `accessibilityRole`,
`accessibilityLabel`, `accessibilityState` and style, so names, roles and sizes
carry over. Native-only properties (`accessibilityViewIsModal`,
`importantForAccessibility`, `accessibilityLiveRegion`) do not, and were read
from source instead.

Mobile 11's search surface is reviewed but unmerged (PR #413), so no `/search`
route was audited.

## What passes

| Surface | Controls | Unnamed | Below 44 pt |
| --- | ---: | ---: | ---: |
| `/` (notes) | 9 | 0 | 0 |
| `/journal` | 85 | 0 | 30 |
| `/tasks` | 9 | 0 | 0 |
| `/tags` | 9 | 0 | 0 |
| `/people` | 9 | 0 | 0 |
| `/trash` | 9 | 0 | 0 |
| Notes tree sheet | 22 | 0 | 1 |
| Account panel | 21 | 0 | 0 |

- **Every control on every surface has an accessible name.** 184 controls, zero
  unnamed, zero relying on an icon alone. The shell draws its glyphs from plain
  `View`s and marks them `importantForAccessibility="no"`, so no decorative
  shape reaches the reader.
- **Names carry position, not just identity.** A tree row announces
  `Drafts, folder, 1 item, level 1, 2 of 3` and `Native shell, note, pinned,
  level 2, 2 of 3`. React Native has no `treeitem` role, so the shell uses
  `button` for folders and `link` for notes inside an
  `accessibilityRole="list"` named *Workspace tree*, and puts the level, set
  size and position into the label by hand. That is a deliberate deviation
  from the desktop sidebar's ARIA tree, and it is the right one: it is the
  only way to say level and position through a role the platforms implement.
- **Touch targets are the shell's constants, not accidents.** Toolbar controls
  are 44 × 44, tab bar destinations 55.7 × 56, tree rows 334.4 × 44, theme
  radios 334.4 × 44 — matching `MINIMUM_TOUCH_TARGET`, `TAB_BAR_HEIGHT` and
  `TREE_ROW_HEIGHT` in `mobile/src/shell/metrics.ts`.
- **Both overlays offer a named close control** — a 44 × 44 button and a
  full-bleed `Close notes` / `Close account` scrim — and the account panel's
  ten theme choices are a proper radio group.
- **Headings exist on every route** (`Journal`, `Today`, `September 2026` on
  the journal; the note or view title elsewhere), so heading navigation works.
- **Zero console errors** across all eight surfaces.

## Defects

Each of these is outside the paths Mobile 16 owns and is reported on #397 for
the owning issue rather than changed here.

### 1. The mood trend strip: 30 touch targets 10 pt wide (R-Q2)

`mobile/src/features/journal/mood-trend-strip.tsx` renders the last thirty days
as one `Pressable` bar each, `accessibilityRole="button"`, each measuring
**10 × 56 pt** — a quarter of the 44 pt minimum. Thirty independent targets
cannot fit 44 pt each across a 390 pt screen, so `hitSlop` cannot fix it: the
slop regions would overlap. It needs a product decision — make the strip a
non-interactive summary and navigate days from the calendar, or collapse it to
weekly bars. Owner: Mobile 12 (#393).

### 2. The pinned strip: rows 28 pt tall (R-Q2)

`mobile/src/shell/pinned-strip.tsx` sets `height: 28` on its rows, so
`Open Native shell` renders 101 × **28** pt. Unlike the mood bars this is a
one-line fix — the strip has the vertical room. Owner: Mobile 07 (#388).

### 3. Sheets hide the background from VoiceOver but not from TalkBack

`mobile/src/shell/sheet.tsx` sets `accessibilityViewIsModal={open}` on the
panel, which is **iOS-only**. Android needs
`importantForAccessibility="no-hide-descendants"` on the content behind the
sheet, the way `mobile/src/features/lock/lock-gate.tsx` already does it. The
web audit shows the consequence directly: with the notes sheet open, all six
tab bar destinations and both toolbar controls are still in the accessibility
tree behind the scrim. On Android, TalkBack will swipe straight out of the
sheet into the shell underneath it. The same gap exists in
`mobile/src/features/journal/go-to-date-sheet.tsx` and
`mobile/src/features/capture/quick-capture.tsx`. Owners: Mobile 07 (#388),
Mobile 12 (#393).

## Not covered

- **Announcement order, focus movement on sheet open and close, live-region
  updates, rotor and reading-control behaviour, gesture conflicts with the
  shell's own pan handlers.** All of these need a real screen reader.
- **The editor.** It is the desktop ProseMirror surface inside a webview; its
  accessibility is the desktop editor's, reached through the platform
  webview's own screen-reader bridge, and nothing here exercises that path.
- **Dynamic Type and Android font scaling, contrast across the nine themes,
  reduced-motion behaviour, and landscape.**

R-Q2 is therefore **partially evidenced**: naming and structure are proven and
clean, two touch-target violations and one Android modality gap are proven and
open, and operability under VoiceOver and TalkBack remains unverified on both
platforms.
