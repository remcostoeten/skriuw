# Performance Audit Recap

Date: 2026-06-10
Branch: `feature/offline-fast-workspace`

## Goal

Audit the application for performance wins and correctness issues that affect the end-user feeling of speed. The target was a near instant, offline-like experience, with permission to overhaul internals because there are no existing users to preserve compatibility for.

## Execution Model

The work was split across parallel agents with disjoint ownership areas, then reviewed, integrated, verified, and committed on the feature branch.

## Commits Created

- `4b2ed7e1 perf(notes): switch files before save flush`
- `490ec793 fix(journal): guard draft saves by active date`
- `03922231 perf(notes): diff persisted note links`
- `b5605b5b perf(guest): persist workspace through async store`
- `bd76ee78 perf(editor): scope Mantine provider to editor`

## What Changed

### Instant Note Switching

Files:

- `src/features/notes/hooks/use-notes-layout.ts`
- `__tests__/features/notes/hooks/use-notes-layout-save-switch.test.ts`

Before, selecting another note, navigating next/previous, or opening a split pane could wait for pending editor saves to flush. That made navigation feel blocked by persistence.

Now the UI switches immediately and flushes the previous note in the background with checkpoint creation. Destructive or version-sensitive paths still use the stricter save behavior.

Result:

- Faster note switching.
- Faster focused-pane navigation.
- Split pane opening no longer waits on `flushAll`.
- Regression tests cover delayed flushes while the visible note changes immediately.

### Journal Draft Race Protection

Files:

- `src/features/journal/hooks/use-journal-entry.ts`
- `src/features/journal/hooks/use-journal-entries.ts`
- `__tests__/features/journal/draft-race.test.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260610000000_journal_entry_unique_date/migration.sql`

The journal had race-risk around same-date entries and stale cache snapshots. A save response or cache refresh could acknowledge or overwrite the wrong draft if the user changed content quickly.

Now journal drafts use revision tracking. Same-date snapshots are only adopted when they are safe, and save/error acknowledgements only apply to the current active date and latest revision.

The entries cache also dedupes active entries by date, and the database now enforces one active journal entry per `user_id` and `date_key` using a Postgres partial unique index where `deleted_at IS NULL`.

Result:

- Local draft content is less likely to be clobbered by stale server/cache data.
- Same-date duplicates are prevented at the database layer.
- Optimistic creates update by date instead of appending duplicate active entries.

### Diffed Note-Link Persistence

Files:

- `src/domain/notes/actions.ts`
- `src/domain/notes/note-link-sync.ts`
- `__tests__/domain/notes/note-link-sync.test.ts`

Before, note-link sync rewrote all persisted `note_links` rows for a note by deleting and recreating them.

Now link sync builds the desired outgoing link/tag rows, compares them to existing rows, deletes only removed rows, updates changed targets, and creates only missing rows.

Result:

- Autosaves with unchanged links avoid database churn.
- Existing rows are preserved when identical.
- Tag updates now also refresh persisted tag link rows.
- The sync still runs inside the existing Prisma transaction.

### Async Guest Workspace Persistence

Files:

- `src/core/workspace-backend/local-store.ts`
- `src/core/workspace-backend/local-backend.ts`
- `src/core/workspace-backend/index.ts`
- `src/providers/guest-workspace-bootstrap.tsx`
- `src/core/auth/index.ts`
- `src/features/settings/sections/data-section.tsx`
- `__tests__/core/workspace-backend/local-backend.test.ts`
- `__tests__/providers/guest-workspace-bootstrap.test.tsx`

Guest mode previously relied on synchronous localStorage persistence for workspace edits. That is simple, but it can block the main thread and does not scale well as the demo workspace grows.

Now guest workspace persistence goes through a versioned async store:

- IndexedDB is used when available.
- localStorage remains the fallback.
- Existing localStorage workspace data is not migrated into IndexedDB because the app has no users yet and old client data does not need to be retained.
- Old guest workspace compatibility paths were removed rather than preserved.
- Writes are serialized so rapid guest edits do not race each other.
- Guest bootstrap awaits async merge data before seeding local overrides into React Query.
- Guest reset is awaitable so IndexedDB clears durably before demo reloads or auth transitions.

Result:

- Guest editing feels more offline-native.
- Larger local workspaces avoid synchronous localStorage write pressure.
- The new guest storage architecture avoids carrying old local workspace migration code.

### Editor Bundle Isolation

Files:

- `src/providers/app-providers.tsx`
- `src/features/editor/components/rich-text-editor.tsx`

The global app provider wrapped the whole app in the BlockNote/Mantine provider, which created a broad import edge from the app shell to editor-only UI dependencies.

Now `BlockNoteMantineProvider` is scoped inside `RichTextEditor`, around the BlockNote view/controllers that need it.

Result:

- Mantine is no longer pulled into the global app-provider path.
- Editor-specific provider cost is paid at the editor surface instead of the whole app shell.
- The rich editor still has the provider context needed by BlockNote toolbar/menu/popover components.

## Verification

Commands run after integration:

```bash
bun run lint
bun run test:unit
bun run build
```

Results:

- `bun run lint` passed with existing unused-code warnings.
- `bun run test:unit` passed: 149 tests, 0 failures.
- `bun run build` passed.
- Build still emits the existing Postgres SSL-mode warning from `pg-connection-string`/`pg` during static generation.

## Existing Dirty Work Left Alone

These files were already dirty before the performance branch work and were not included in the performance commits:

- `bun.lock`
- `next-env.d.ts`
- `package.json`
- `src/app/app/loading.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/features/editor/components/editor-container.tsx`
- `src/features/editor/components/editor-toolbar.tsx`
- `src/features/layout/components/app-loading-shell.tsx`
- `src/features/layout/components/icon-rail-skeleton.tsx`
- `src/features/layout/components/icon-rail.tsx`
- `src/features/notes/components/notes-layout-shell.tsx`
- `src/features/notes/components/sidebar-panel.tsx`
- `src/features/notes/components/sidebar/sidebar-tree-skeleton.tsx`
- `.agents/skills/auth-drawer/`
- `src/features/auth/auth-drawer-adapter.ts`

## Potential TODOs

### High Priority

- Run the Prisma migration against a staging database and verify the duplicate-soft-delete step on realistic journal data.
- Add an end-to-end smoke test for guest edit persistence across reloads, including IndexedDB-backed storage.
- Add an end-to-end smoke test for rapid note switching while autosave is pending.

### Performance Follow-Ups

- Measure actual route bundle output before and after the Mantine provider move, then document the size delta.
- Audit remaining app-shell imports for editor-only or authenticated-only dependencies.
- Profile first-load hydration on `/app` with a seeded guest workspace and identify any remaining long tasks.
- Consider moving more guest bootstrap work behind Suspense or route-level preloading if it shows up in hydration traces.
- Review React Query cache invalidation paths for notes and journal to reduce broad invalidations after narrow mutations.
- Add lightweight performance marks around note switch, editor ready, autosave start, and autosave flush completion.

### Correctness Follow-Ups

- Stress-test note-link sync with large notes and many links to decide whether batched `Promise.all` updates are worth it.
- Confirm the partial unique journal index matches all restore/soft-delete flows.
- Add tests for restoring a soft-deleted journal entry when another active entry exists for the same date.
- Add tests for guest reset with IndexedDB present, not only localStorage-visible state.
- Review all call sites that intentionally ignore promises from persistence or save helpers.

### Product/UX Follow-Ups

- Consider a subtle save-state indicator that does not block navigation but still communicates background flush status.
- Define expected offline/demo behavior when IndexedDB is blocked or quota is exceeded.
- Decide whether guest data should sync into a newly created account or continue to be discarded on sign-up.
