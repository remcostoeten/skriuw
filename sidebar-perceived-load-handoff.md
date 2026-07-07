# Handoff — Sidebar perceived-load gap (calendar instant, tree/recents/projects slow)

## Agent prompt

You are picking up a perceived-performance task in the Skriuw web app (`apps/web`). The
mini-calendar in the left sidebar paints instantly while the note tree, Recents, and
Projects sections show skeletons for a long time on dev builds. Your job is to close that
perceived-load gap — make the data-backed sections _feel_ as fast as the calendar — without
breaking the local-first cache/reconcile invariants.

### Why the gap exists (already diagnosed — do not re-investigate from scratch)

- **Calendar is free.** `MiniCalendar` (`apps/web/src/features/notes/components/sidebar/journal/mini-calendar.tsx`)
  renders purely from `date-fns` math on `new Date()` (`journal-section.tsx:51-52`). No fetch.
  Its only data dependency is the entry dots (`datesWithEntries` from `useJournalEntries()`),
  defaulted to `[]` in `journal-section.tsx:50`, so the grid paints before that resolves.
- **Everything else waits on the notes backend.** `SidebarPanel` receives
  `files` / `folders` / `filesById` / `isFilesLoading` as props from the parent
  (`apps/web/src/features/notes/components/sidebar-panel.tsx:139-158`). Until the workspace-backend
  notes query resolves, `FileList` shows `sidebar-tree-skeleton`, and Recents/Projects can't
  render because they resolve display names _through_ `filesById`
  (`sidebar-panel.tsx:509-531`).
- **Dev-only magnitude is Turbopack.** The extreme lag on dev builds is cold-compile + RAM
  pressure, NOT slow DB/server (DB ~14ms, warm render ~0.25s). See memory `local-dev-perf.md`.
  Always measure a production build before optimizing data code so you don't chase a phantom.

### Tasks (in priority order)

1. **Verify first-paint cache hydration.** Trace where `files` / `isFilesLoading` originate
   in `apps/web/src/features/notes/components/notes-layout-shell.tsx` and confirm the RQ +
   IndexedDB persisted cache (see memory `local-first-caching.md`) hydrates the notes query
   _synchronously before first paint_ on repeat visits — not inside an effect that runs after
   the skeleton has already shown. If it's post-effect, make repeat visits skip the tree
   skeleton.
2. **Decouple Recents/Projects from the full `filesById` map.** Persist id→name/title
   alongside the recents entries in the sidebar store (`sidebar/store`) so those rows render
   instantly (like the calendar) from cached names, then reconcile against `filesById` when the
   real data lands. Guard against ghost-row flicker per the race-safety rules in
   `local-first-caching.md`.
3. **Confirm in a production build.** Run the tree/recents/projects vs calendar comparison in a
   prod build to confirm the gap shrinks and no reconcile regression (duplicate/ghost rows,
   stale names) appears.

### Constraints

- Follow the global code style: `function` declarations for standalone functions, arrow fns for
  callbacks; single non-exported type named `Props`; no explanatory comments; no empty catches.
- Do not change the reconcile/accumulation semantics that prevent ghost-row flicker.
- Verify with `bunx tsc --noEmit` and the `/verify` skill (drive the real sidebar), not just
  typecheck.

### Relevant files

- `apps/web/src/features/notes/components/sidebar-panel.tsx` — section rendering, props in.
- `apps/web/src/features/notes/components/sidebar/journal/{journal-section,mini-calendar}.tsx` — the fast path.
- `apps/web/src/features/notes/components/sidebar/{recents-section,store}.tsx` — the slow path to fix.
- `apps/web/src/features/notes/components/notes-layout-shell.tsx` — where notes data enters.
- Memory: `local-first-caching.md`, `local-dev-perf.md`, `skeleton-loading-architecture.md`.
