---
title: "ADR-0049: One shared icon system, Fluent Regular, motion as data"
---

- Status: accepted
- Date: 2026-09-21

## Context

Icons were drawn three different ways. The desktop hand-copied about 120
Lucide drawings into `apps/workspace/src/shared/icons/static.tsx` and normalised their
stroke to a fixed on-screen weight; its animated icons were vendored
animate-ui components on `motion/react` plus three animateicons holdovers,
adapted to one prop shape and lazy-loaded in a separate chunk. `lucide-react`
was still imported directly in two places, drawing at stroke 2. The mobile
shell had no SVG runtime and built 13 glyphs from absolutely positioned
views, and the journal used `‹ › +` characters. Desktop and mobile disagreed
on what "notes" looks like.

A design review settled the set and the motion: Fluent UI System Icons,
Regular style, everywhere; 28 hover animations with approved concepts and
timings; nothing fades in from invisible, no skew on the folder or the trash
lid, and every animation ends exactly at rest.

## Decision

- **Fluent Regular is the only icon set.** `packages/icons` (`@skriuw/icons`)
  generates path data for every glyph the apps draw from the official MIT
  package `@fluentui/svg-icons`, pinned as a dev dependency. The generated
  files are committed and the generator's `--check` runs in
  `scripts/generate.sh`; there is no runtime icon dependency. Both Fluent
  drawings are kept: 20-unit for renders of 20px and below, 24-unit above
  (`selectGlyph`). Animated icons always use the 24-unit drawing so their
  parts line up.
- **Geometry and motion are data; platforms only draw.** Each animated
  icon's Fluent glyph is split into named parts by subpath and by clip cuts
  (`packages/icons/parts.ts`), resolved by the generator into
  `generated/animated.ts`. The motion spec (`motion.ts`) lists per part the
  keyframes (translate, rotate, scale, skew, opacity), offsets, duration,
  delay, per-segment easing token and transform origin in grid units — a
  faithful port of the approved CSS. The desktop plays it with the Web
  Animations API; mobile samples the same spec per frame with the shared
  `samplePose` and draws with `react-native-svg`. `motion`/`framer-motion`
  are no longer involved in icons.
- **At rest an animated icon is its static glyph.** The icon renders the
  exact Fluent path and swaps to its parts only while moving. Tests prove the
  swap is invisible: sampling shows the visible parts partition the glyph,
  parts outside the glyph (the notes sheet, the search glint, the pin ripple
  and the chevron ghosts) are hidden at both ends, every visible part starts
  and ends at rest or on a declared symmetry of its geometry, and no visible
  part changes opacity.
- **Desktop keeps named exports.** `static.tsx` is a table of named
  components over one data-driven `FluentIcon`, so the ~300 call sites did
  not churn; icons are `aria-hidden` unless labelled. Generating a
  component file was rejected because the table is the only thing it would
  add. `AppIcon` keeps its contract — host-button hover, the
  `AnimatedIconsProvider` preference — and the registry of action names is
  shared with mobile (`packages/icons/registry.ts`).
- **Notes is the open folder on both platforms,** the same glyph as the
  desktop rail.
- **Reduced motion does not override the preference.** The "Animated icons"
  setting remains the only switch, as before; the motions are short,
  one-shot, and triggered by the user's own pointer or press.

## Adapting line motion to filled glyphs

The approved motions were designed on Lucide line drawings. Fluent glyphs
are filled outlines, so stroke-dash motions and parts that had no Fluent
counterpart were re-expressed; everything else is the approved keyframes on
Fluent geometry.

- Tasks: the checkmark re-tick (stroke retract) is a dip-and-pop
  (scale 0.8 with a small counter-rotation, then 1.15) about the tick's
  elbow.
- Search: the glint is a short Fluent-weight arc that sweeps across the
  glass, clipped to the lens, instead of drawing on.
- Journal: Fluent's calendar has no binder rings, so the ring hop is
  dropped; the week slides out behind the calendar frame and back in,
  instead of fading; today's marker is Fluent's own day dot, which hops from
  the previous day onto its own instead of growing from nothing.
- People: the second person steps down and back up beside the first instead
  of fading out and in.
- Image: the sun sets behind the ridge through a clip, instead of fading.
- Toggle sidebar: Fluent's panel has no sidebar items, so only the divider
  slides. The metadata toggle mirrors it on `panel_right`.
- Trash: the slats compress with the bin (same origin) instead of about the
  view-box corner.
- Pin: the pin is diagonal in Fluent, so the lift and press follow its axis.
- Link: the halves pull apart horizontally, the axis of Fluent's link.
- Heading: the crossbar stretches 1.5× so it stays joined to Fluent's posts.
- More: the dots gather over Fluent's 6-unit spacing.

No glyph was redrawn by hand. Three shapes that exist only in motion are
drawn in Fluent's style in `shapes.ts`: the notes sheet, the search glint
and the pin ripple.

## Consequences

- Every icon in both apps changes look, from Lucide lines to Fluent fills.
- Icon data ships in the main bundle (about 27 KB gzip of glyph paths and
  6 KB of animated parts) and the lazily loaded animation chunk is gone, so
  nothing is fetched on hover and navigation never waits on an icon chunk.
  Hovering does not re-render React.
- Adding an icon means adding its Fluent name to `catalog.ts` and running
  `bun packages/icons/generate.ts`; adding an animation means a part split in
  `parts.ts` and a motion in `motion.ts`, both covered by the shared tests.
- Mobile animation is sampled on the JS thread, not with Reanimated: the
  motions are short and triggered on press, and the shared sampler stays
  plain TypeScript instead of worklets.
