# Guest Mode Handoff

Plan for completing the guest-mode workspace. Written so a fresh Claude session can pick up without prior context.

## Goal

Unauthenticated visitors land on `/app` and see a pre-seeded workspace. Their edits go to `localStorage` only (key: `skriuw:guest:workspace:v2`). The DB never sees guest mutations. Features that require a server (sharing, export, AI) are gated with a sign-up CTA.

## Architecture (built)

- **Route gate**: `src/proxy.ts` lets unauthed visitors reach `/app/*`. Public routes also include `/sign-in`, `/sign-up`, `/project-planning/*`, `/s/*`.
  - *Trap*: the current implementation uses a comma expression in `isPublicRoute` — verify it behaves correctly for your edits. Run through `/sign-in`, `/sign-up`, `/project-planning`, `/s/<id>`, `/app`, `/app/anything-else` manually to confirm each is reachable while signed out.
- **Server page**: `src/app/app/page.tsx` branches on session. Authed → DB prefetch. Guest → `loadGuestWorkspaceSnapshot()` from `src/domain/seed/guest-bundle.ts` hydrates the React Query cache with the active seed bundle.
- **Layout**: `src/app/app/layout.tsx` no longer redirects unauthed users. Renders `<GuestBanner />` (`src/features/layout/components/guest-banner.tsx`) for them.
- **Backend abstraction**: `src/core/workspace-backend/`
  - `types.ts` — `WorkspaceBackend` interface (6 methods: notes + folders CRUD, `mode: "server" | "local"`).
  - `server-backend.ts` — wraps existing Prisma-backed server actions.
  - `local-backend.ts` — `createLocalBackend(queryClient)` reads/writes `localStorage`. On a first edit of a seed-only note/folder, falls back to reading the current value from the React Query cache so seed fields (name, parentId) survive.
  - `context.tsx` — `WorkspaceBackendProvider`, `useWorkspaceBackend()`, `useIsGuestWorkspace()`. Mounted in `src/providers/app-providers.tsx`.
- **Bootstrap**: `src/providers/guest-workspace-bootstrap.tsx` runs on guest mount, layers `localStorage` mutations on top of the seed-hydrated cache, and seeds `notesKeys.detail(id)` for every note so navigation between notes works.
- **Migrated hooks** (call `useWorkspaceBackend()` instead of importing server actions):
  - Notes: `use-create-note`, `use-update-note`, `use-delete-note`, `use-debounced-save`
  - Folders: `use-create-folder`, `use-update-folder`, `use-delete-folder`
  - Reads: `use-notes`, `use-folders`, `use-note` swapped from `useAuthedApiQuery` to plain `useApiQuery`; `useNote` short-circuits to `null` on cache miss when guest.
- **Feature gates**: `src/shared/ui/guest-gate.tsx` wraps a trigger; in guest mode a transparent overlay intercepts clicks and opens a Popover with sign-up CTA. Currently wraps:
  - Share: `metadata-panel.tsx` (mobile + desktop, plus `onShare` button); `file-list.tsx` mobile action block.
  - Context menu share: `note-send-menu.tsx` `NoteSendContextSubmenu` shows a locked menu item (Popover can't live inside ContextMenu).
  - AI: `editor-toolbar.tsx` wraps the AI dropdown.
  - Export/Import: `data-section.tsx`.

## Known traps

1. **`refetch()` and `mutateAsync` bypass the `enabled` gate.** `useAuthedApiQuery` only disables the *automatic* fetch. Manual `query.refetch()` or `mutation.mutateAsync()` from a mounted `useEffect` will still fire server actions. The `prefetchShareLink` bug already bit us — `useNoteSendMenu` now reads `useIsGuestWorkspace()` before prefetching. Audit similar patterns elsewhere.
2. **`GuestGate`'s overlay only blocks clicks.** Effects inside the wrapped subtree still run. If a wrapped component fires a server action on mount, you need to gate inside that component too.
3. **Storage shape changes need a version bump.** `STORAGE_KEY = "skriuw:guest:workspace:v2"`. If you change the payload shape, bump to v3 and add v2 to `LEGACY_STORAGE_KEYS` in `local-backend.ts`. The legacy keys are wiped on first read.
4. **Seed bundle must be marked `isActive`** in the `seed_bundles` table or `loadGuestWorkspaceSnapshot` returns empty. Use `/admin/seed` to activate, or re-run `bun run seed:welcome-bundle`.

## Status — all tasks executed (2026-05-29)

Tasks A–H below are complete. Summary of what shipped:

- **A** — `journal/page.tsx` prefetch now gated behind `if (user)`; `app/shared/page.tsx` renders `AuthRequiredState` for guests instead of calling `getSharedNotesOverview()`; `proxy.ts` adds `/` to `publicRoutes` so the landing page is reachable while signed out. Settings account-only tabs (Account, Security, AI, Tags) render a `GuestSectionNotice` for guests so no server action can be triggered. Admin already redirects via `requireAdmin()`.
- **B** — Confirmed mount-time server calls are safe: `useNoteSharing.shareQuery` is `useAuthedApiQuery` (disabled for guests), `prefetchShareLink` is `isGuest`-gated, journal read hooks are cache-only/authed. No new escape hatches found.
- **C** — `recordGuestEngagement()` in `local-backend.ts` counts create/update under `skriuw:guest:engagement:v1` and dispatches `GUEST_SIGNUP_PROMPT_EVENT` at 10/25/50. `GuestSignupPrompt` (mounted in `app-providers.tsx`) shows a dismissable dialog.
- **D** — **Decision: wipe.** `resetGuestStorage()` is called after `signUpWithPassword` and before the OAuth redirect; it now also clears the engagement key.
- **E** — **Decision: journal + tags stay account-only** (consistent with the existing `AuthRequiredState` gate). Actionable part done: the note **versions** UI is hidden for guests in `metadata-panel.tsx`.
- **F** — Guest-only "Reset demo workspace" card added to `data-section.tsx` (`resetGuestStorage()` + reload).
- **G** — Tests: `__tests__/core/workspace-backend/local-backend.test.ts`, `__tests__/domain/seed/guest-bundle.test.ts`, `__tests__/providers/guest-workspace-bootstrap.test.tsx` (16 tests). Full suite: 127 pass.
- **H** — `tsc --noEmit` clean in `src/`, `oxlint` clean, `next build` succeeds (stale `.next/types` cleared).

---

## Work remaining (original plan — now complete)

Ordered by priority. Each task lists: file paths to touch, acceptance criteria, and the trap most likely to surface.

### Priority 1 — Things guests will hit on click-through

#### Task A — Audit `/app/*` sub-routes for guests

Currently only `/app/page.tsx` branches on user. Other server pages likely call `getServerUser()` and either throw or render in a broken state for guests.

Pages to audit (read each, check whether `getServerUser()` is required, decide guest behavior):
- `src/app/app/journal/page.tsx`
- `src/app/app/settings/page.tsx`
- `src/app/app/activity/page.tsx` (if it exists)
- `src/app/app/profile/page.tsx` (if it exists)
- `src/app/(admin)/admin/*` — admin pages should redirect non-admins, fine.

For each page, choose one of:
- (a) **Disable for guests** — redirect to `/app` or render a "Sign up to use" empty state. Cheapest. Pick this unless the page is core to the demo.
- (b) **Enable for guests** — same pattern as `/app/page.tsx`: branch on user, hydrate from seed/empty for guests, ensure any client hooks tolerate `useIsGuestWorkspace()`.

Acceptance: clicking every nav item in the sidebar as a guest does not 500 and renders something sensible.

#### Task B — Audit other `refetch`/`mutateAsync` escape hatches

Grep:
```bash
grep -rn '\.refetch(\|\.mutateAsync(' --include="*.ts" --include="*.tsx" src
```

For each callsite, check whether it lives inside a `useEffect` / `useCallback` that runs without a user gesture. If yes, gate with `useIsGuestWorkspace()`. Examples likely to surface:
- Sharing actions (already mostly gated via `GuestGate`, but verify).
- AI provider key fetching.
- Journal tag autoload.
- Any "auto-publish on first share" flows.

Acceptance: clicking through every feature visible to a guest produces zero 500s in the server log.

### Priority 2 — Explicit deferrals from the spec

#### Task C — Click-counter sign-up prompt

Spec: "every X clicks or so we will prompt to login". Not built.

Implementation sketch:
- Add a counter to `LocalBackend.createNote` and `LocalBackend.updateNote` — increment in `localStorage` under `skriuw:guest:engagement:v1`.
- When count crosses thresholds (suggest: 10, 25, 50), broadcast a `CustomEvent("skriuw:guest:prompt-signup")` on `window`.
- Mount a single listener in `src/providers/app-providers.tsx` that opens a Dialog with the same sign-up CTA copy as `GuestGate`.

Acceptance: a guest who creates/edits 10+ notes sees a one-time sign-up dialog. Dismissable. Re-fires at the next threshold.

#### Task D — Guest → signed-up data migration

Decide first: keep local data on signup, or wipe?

If keep (better UX, more work):
- On successful `signUpEmail`, before redirect, POST the localStorage payload to a new server route `/api/data/import/guest` that calls into the existing import pipeline (`src/domain/data-transfer/`) with merge policy.
- Clear localStorage on success.
- Add a confirmation step before signup so users know their work will move.

If wipe (simpler, worse UX): just call `resetGuestStorage()` after successful signup in `src/core/auth/index.ts`'s `signUpWithPassword`.

Acceptance: documented decision. Either is acceptable; pick one and ship.

### Priority 3 — Feature coverage

#### Task E — Extend `WorkspaceBackend` to cover what guests should be able to do

Currently guests can edit notes and folders. Everything else either silently no-ops or is `GuestGate`-blocked.

Decide what guests should be able to try in the demo. Likely candidates:
- **Journal entries** — add `createJournalEntry`/`updateJournalEntry`/`deleteJournalEntry` to `WorkspaceBackend`, implement in both server and local backends, migrate `src/features/journal/hooks/*` to use the backend.
- **Tags** — similar.
- **Note versions** — probably skip; versions are a "history of edits" concept that doesn't carry across sessions. Hide the versions UI for guests.

Pattern to follow (same as notes/folders):
1. Add methods to `src/core/workspace-backend/types.ts`.
2. Wire `ServerBackend` (just re-export the existing server actions).
3. Implement `LocalBackend` methods using `localStorage` + cache-fallback for first-time edits of seed entities.
4. Extend `mergeSeedWithGuestNotes` pattern in `local-backend.ts` for the new entity type.
5. Extend `GuestWorkspaceBootstrap` to merge that entity type's storage on mount.
6. Update the seed transform in `src/domain/seed/guest-bundle.ts` if seeds carry that entity type.
7. Migrate the hooks.

#### Task F — "Reset demo" button

In `src/features/settings/sections/data-section.tsx` or a new section visible only to guests, add a "Reset demo workspace" button that calls `resetGuestStorage()` and reloads the page. One-liner UX, makes the demo replayable.

### Priority 4 — Hygiene

#### Task G — Tests

Zero tests on new guest-mode code. At minimum:
- `__tests__/core/workspace-backend/local-backend.test.ts` — covers: empty → create returns note, update of seed-only id falls back to cache, update of stored id mutates in place, deleteFolder cascades to descendant folders + their notes, storage version migration wipes v1.
- `__tests__/domain/seed/guest-bundle.test.ts` — covers: ref → id prefix, parent ref resolution, empty bundle → empty snapshot.
- `__tests__/providers/guest-workspace-bootstrap.test.tsx` — covers: merge happens only when guest, detail cache populated for every merged note.

Use `fake-indexeddb` is already in devDeps but my localStorage usage doesn't need it. Mock `window.localStorage` directly.

#### Task H — Stale `.next/types`

After the proxy/route deletions, `.next/types/validator.ts` references gone-routes. Cleared automatically on next `bun run build`. If TS errors mention `src/app/api/trial/enter/route.js`, just rebuild.

## Verification checklist before declaring done

Run through each as a guest (incognito window, no session):

- [ ] Navigate to `/`, `/sign-in`, `/sign-up`, `/project-planning` — all reachable.
- [ ] Navigate to `/app` — seeded workspace loads, no 500 in server log.
- [ ] Click each note in the sidebar — content displays, no 500.
- [ ] Edit a note's content — auto-save fires, no 500. Reload — edit persists.
- [ ] Edit a seed note's title — persists across reload, doesn't get reset to "Untitled.md".
- [ ] Create a new note — appears in tree, persists across reload.
- [ ] Create a folder, move notes into it — persists.
- [ ] Delete a folder with children — cascades correctly.
- [ ] Click Share / Export / AI — `GuestGate` popover appears, no server call made.
- [ ] Open every nav item in the sidebar — no 500s.
- [ ] Open a fresh incognito tab — sees the same seed view (not the previous tab's mutations).
- [ ] Sign up — decide: data migrates or wipes per Task D.

## Files to know

| Concern | File |
|---|---|
| Backend interface | `src/core/workspace-backend/types.ts` |
| Local backend | `src/core/workspace-backend/local-backend.ts` |
| Provider | `src/core/workspace-backend/context.tsx` |
| Seed → guest snapshot | `src/domain/seed/guest-bundle.ts` |
| Bootstrap merge | `src/providers/guest-workspace-bootstrap.tsx` |
| Guest gate UI | `src/shared/ui/guest-gate.tsx` |
| Guest banner | `src/features/layout/components/guest-banner.tsx` |
| Server page branch | `src/app/app/page.tsx` |
| Route gate | `src/proxy.ts` |
| App providers | `src/providers/app-providers.tsx` |
