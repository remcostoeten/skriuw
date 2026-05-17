# Skriuw Performance Audit And Optimization Plan

Date: 2026-05-17

This audit is based on static inspection plus a production build of the current repo:

```bash
NEXT_TELEMETRY_DISABLED=1 bun run build
```

Build result:

- Next.js 16.1.6 with Turbopack compiled successfully in 7.0s.
- `.next` total size: 73 MB.
- `.next/static`: 18 MB.
- `.next/server`: 54 MB.
- Largest emitted JS chunks:
  - `65e99e38404bf952.js`: 1291.8 KB raw, 382.4 KB gzip. Contains BlockNote, ProseMirror, Mantine references.
  - `f7f22bc8bd06cab2.js`: 761.7 KB raw, 192.1 KB gzip. Contains Three/OGL references.
  - `e4d17448968d881c.js`: 608.0 KB raw, 226.2 KB gzip.
  - `e7cac0e4bdcd283a.js`: 612.1 KB raw, 44.0 KB gzip.
  - `210748c6c284adab.js`: 516.7 KB raw, 127.5 KB gzip. Contains `PixelBlast`, Three, postprocessing.
- Route output:
  - `/app`, `/app/journal`, `/app/settings`, `/project-planning`, `/sign-in`, and `/sign-up` are dynamic.
  - Only `/_not-found` is static.
  - Proxy middleware runs on almost all non-asset routes.

## Executive Summary

The biggest opportunities are not micro tweaks. They are data-shape and hydration-shape changes:

1. Split the notes data layer. `listNotes()` currently loads full markdown and `rich_content` for every note into React Query and browser memory. This dominates first-load cost as note count grows.
2. Move app providers out of the root document. `src/app/layout.tsx` wraps the whole app, including auth and public pages, in `AppProviders`. This makes React Query, MotionConfig, ThemeProvider, shortcuts, auth bootstrap, and persistence bootstrap part of the global client surface.
3. Make the auth WebGL background lazy or replace it. The auth layout eagerly loads a 520 KB raw / 127.5 KB gzip `PixelBlast` chunk on sign-in/sign-up.
4. Defer rich editor work more aggressively. BlockNote is dynamically imported for `/app`, but editor serialization still does expensive markdown conversion and `JSON.stringify` work during editing.
5. Stop scanning all notes on the client for backlinks, tags, and search. These operations should be indexed metadata or server queries once the workspace grows.
6. Add database indexes and RPCs around the real access patterns. The app filters by `user_id`, `deleted_at`, `parent_id`, date keys, and updated/created timestamps. Those indexes are not visible in the migrations in this repo for core content tables.
7. Add measurement gates. There is no bundle budget, profiler trace, Lighthouse budget, query payload budget, or Supabase query-plan check in CI.

## Performance Targets

Use these as concrete pass/fail gates after the first optimization pass:

- App shell route `/app`
  - P75 TTFB: under 350 ms from production region close to database.
  - P75 LCP: under 1.8 s desktop, under 2.8 s mid-range mobile.
  - P75 INP: under 150 ms.
  - Initial client JS for non-editor app shell: under 250 KB gzip excluding Next shared runtime.
  - Full BlockNote editor chunk: async only, no auth/settings/project-planning route inclusion.
- Notes workspace
  - Initial notes list payload: under 150 KB for 1,000 notes with typical titles/tags/folders.
  - Active-note payload: one note body plus metadata, not whole workspace bodies.
  - Note switch: under 100 ms for cached notes, under 300 ms for uncached notes on normal broadband.
- Editor
  - Keystroke work: no full-document markdown serialization on every editor transaction.
  - Autosave: no more than one network write per active note per 750 to 1500 ms while typing.
  - Serialization: off main thread or idle scheduled for long documents.
- Database
  - User-scoped list queries should use composite indexes and avoid sequential scans at 10k rows per user.
  - Delete-folder and tag cleanup should be one RPC/transaction, not N client/server round trips.
- Mobile
  - Workspace boot should avoid loading full note bodies.
  - Large lists should be virtualized with `FlatList` or equivalent.

## Domain Audit

### 1. App Shell, Hydration, And Provider Boundaries

Current findings:

- `src/app/layout.tsx` imports and renders `AppProviders` around every route.
- `src/providers/app-providers.tsx` is a client component and includes:
  - `QueryClientProvider`
  - `MotionConfig`
  - `ThemeProvider`
  - `TooltipProvider`
  - `PersistenceBootstrap`
  - shortcut routing handlers
- This means auth routes, public project planning, and not-found pages all inherit the same client provider graph.
- `PersistenceBootstrap` initializes auth and resets/syncs notes, sidebar, and preferences based on auth state. That is app-workspace logic but it runs from the root provider.

Risk:

- Larger root client reference manifests.
- More hydration work on routes that only need a form or public content.
- More chances for auth/bootstrap effects to run on routes that do not need workspace state.

Plan:

- Move `AppProviders` from `src/app/layout.tsx` to an authenticated app group layout, likely `src/app/app/layout.tsx`.
- Create a minimal `RootProviders` only if truly global behavior is required. It should avoid React Query and persistence bootstrap.
- Keep `ThemeProvider` global only if auth/public pages require persisted theme. Otherwise move it to app routes too.
- Split shortcut handling into route-scoped providers. Notes shortcuts should live under notes layout, not global root.
- Keep `TooltipProvider` near UI surfaces that need it. Avoid global tooltip hydration for plain auth/public pages.

Concrete tasks:

- [ ] Replace `AppProviders` in `src/app/layout.tsx` with plain `{children}`.
- [ ] Add `src/app/app/providers.tsx` or reuse `AppProviders` from `src/app/app/layout.tsx`.
- [ ] Move `PersistenceBootstrap` under `/app` only.
- [ ] Confirm `/sign-in` and `/sign-up` client manifests no longer include React Query and app shortcut chunks.
- [ ] Run `bun run build` and compare `page_client-reference-manifest.js` for auth routes.

Expected impact:

- Smaller auth route JS.
- Less root hydration.
- Cleaner separation between public/auth pages and workspace state.

### 2. Auth Routes And PixelBlast WebGL

Current findings:

- `src/app/(auth)/layout.tsx` imports `PixelBlast` directly.
- `src/shared/PixelBlast.jsx` is a client component importing `three` and `postprocessing` at module scope.
- The sign-in/sign-up client manifest includes `210748c6c284adab.js`.
- That chunk is 516.7 KB raw / 127.5 KB gzip and contains `PixelBlast`, Three, and postprocessing references.
- The effect is hidden on small screens with `md:flex`, but the JS still ships on auth routes.

Risk:

- Slow first load on sign-in/sign-up, especially on mobile or cold cache.
- Main-thread and GPU setup cost for a decorative background.
- Wasted JS for users who only need the form.

Plan:

- Dynamically import `PixelBlast` with `ssr: false`.
- Gate it behind a desktop media query before loading the module.
- Respect `prefers-reduced-motion` and never load it for reduced-motion users.
- Consider replacing it with a CSS/static image fallback if auth conversion speed matters more than the effect.

Concrete tasks:

- [ ] Create a small `AuthVisual` client component.
- [ ] In `AuthVisual`, wait for `(min-width: 768px)` and `not (prefers-reduced-motion: reduce)` before rendering the dynamic import.
- [ ] Use `next/dynamic` for `PixelBlast` with a null or CSS fallback.
- [ ] Remove direct `PixelBlast` import from `src/app/(auth)/layout.tsx`.
- [ ] Rebuild and confirm `210748c6c284adab.js` is not an initial auth route chunk.

Expected impact:

- Removes roughly 127.5 KB gzip from initial auth-route JS.
- Avoids GPU setup during form boot.

### 3. Next.js Rendering, Dynamic Routes, And Server Work

Current findings:

- `/app/layout.tsx` calls `getServerUser()` and `ensureCloudStarterContentSeeded(user.id)` on every app route request.
- `ensureCloudStarterContentSeeded()` checks notes and folders every time an authenticated app route renders.
- `/project-planning` is `force-dynamic` and fetches six Supabase tables plus `auth.getUser()`, then a role RPC if signed in.
- Proxy middleware calls `supabase.auth.getUser()` for all matched non-asset routes.

Risk:

- App route TTFB includes auth validation plus seed checks even after onboarding is complete.
- Public project planning cannot be cached even though most users see public read-only data.
- Middleware auth calls add latency to route transitions and server requests.

Plan:

- Make starter seeding an onboarding/user-created marker, not a per-request app layout check.
- Cache public project planning data separately from admin state.
- Use route segment config intentionally:
  - Authenticated workspace: dynamic.
  - Public project planning: static or ISR for public data, dynamic overlay for admin controls.
- Keep middleware, but narrow matchers or route checks if possible.

Concrete tasks:

- [ ] Add a user profile/workspace metadata table or `starter_seeded_at` marker.
- [ ] Change `ensureCloudStarterContentSeeded()` to run only after first authenticated session or missing marker.
- [ ] Split `fetchPlanningSnapshot()` into public snapshot and user/admin snapshot.
- [ ] Make public planning data cacheable with `revalidate` or `unstable_cache` if product requirements allow slightly stale public data.
- [ ] Keep admin mutations dynamic and call `revalidatePath("/project-planning")` after edits.
- [ ] Measure route TTFB before/after with production deploy logs.

Expected impact:

- Lower TTFB for `/app`, `/app/settings`, `/app/journal`.
- Lower database read volume.
- Faster public project planning page for anonymous users.

### 4. Notes Data Layer

Current findings:

- `src/domain/notes/api.ts -> listNotes()` uses `.select("*")`.
- Each note row maps `content` and `rich_content`, and falls back to `markdownToRichDocument(row.content)`.
- `src/app/app/page.tsx` prefetches `listNotes()` and `listFolders()` on the server.
- `useNotes()` hydrates the whole note array into React Query.
- `src/features/notes/specs/right-path.md` already identifies the correct direction: split metadata from active note content.

Risk:

- Initial route payload grows linearly with every note body.
- Browser JSON parse and React Query cache memory grow with workspace size.
- Metadata-only operations still pay for full content.
- BlockNote JSON doubles storage/transfer for many notes.

Plan:

- Implement the existing "Right Path" design:
  - `listNoteMetadata()`: id, name, parent_id, tags, preferred_editor_mode, created_at, updated_at.
  - `getNote(id)`: full content and rich content for one active note.
  - `getNotesByIds(ids)`: batch prefetch for backlinks, recents, or command palette previews if needed.
- Stop deriving common metadata from full note content on the client.
- Move tags/title/search metadata into columns maintained on save.

Concrete tasks:

- [ ] Add `NoteMetadata` type and mapper in `src/domain/notes/api.ts`.
- [ ] Add `listNoteMetadata()` and `getNote(id)`.
- [ ] Add React Query keys: `notesKeys.metadata()`, `notesKeys.detail(id)`.
- [ ] Change `/app` server prefetch to metadata + folders only.
- [ ] Change `useNotesLayout()` to use metadata for tree/navigation and active note detail for editor.
- [ ] Keep mutation optimistic updates in sync for metadata and detail caches.
- [ ] Remove old full-list `listNotes()` once editor, sidebar, metadata panel, and search no longer need it.

Expected impact:

- Large reduction in first payload and memory.
- Faster app boot with large workspaces.
- Cleaner path to server-side indexing.

### 5. Notes Search, Tags, Backlinks, And Metadata Panel

Current findings:

- Sidebar search filters `file.name` and `file.content` for all files in `src/features/notes/components/sidebar-panel.tsx`.
- `MetadataPanel` computes word count, headings, byte size, tags, outgoing links, backlinks, and tagged notes in the browser.
- `buildNoteLinkIndex()` scans every other note for backlinks and calls `resolveNoteLink()`.
- `resolveNoteLink()` rebuilds a title index for each unresolved link, which can become O(links * notes).
- `uniqueTags()` extracts tags from content repeatedly.

Risk:

- Search and backlinks become progressively slower with large note sets.
- Metadata panel work happens in render-time `useMemo`; it can still block the main thread when dependencies change.
- The metadata panel prevents the notes data split unless it is changed.

Plan:

- Short term:
  - Build title index once per `buildNoteLinkIndex()` call.
  - Avoid scanning all full content on initial load.
  - Gate expensive metadata calculations behind panel visibility.
- Medium term:
  - Add note metadata columns: `title`, `plain_text_preview`, `word_count`, `heading_outline`, `tag_names`.
  - Add server-side search endpoint with pagination.
  - Add `note_links` table or server query for backlinks.

Concrete tasks:

- [ ] Refactor `resolveNoteLink()` to accept a prebuilt title index.
- [ ] Change `buildNoteLinkIndex(activeNote, files)` to avoid rebuilding title index per link.
- [ ] Compute `details`, `headingItems`, `tags`, and `linkIndex` only when metadata panel is open.
- [ ] After metadata split, replace content search with metadata search first, then full-text server search.
- [ ] Add `searchNotes(query, limit)` server action using Postgres full text or trigram search.
- [ ] Add `note_links` table later if backlinks become a first-class graph feature.

Expected impact:

- Lower CPU work during note switches and panel toggles.
- Keeps metadata split viable.
- Predictable search latency for large workspaces.

### 6. Folders, Tree, And List Virtualization

Current findings:

- `FileList` already flattens visible tree nodes and has row-height constants, scroll state, and overscan.
- File/folder operations use maps from `buildNoteIndexes()`, which is good.
- Some actions still do linear scans:
  - `moveFolder()` scans `folders` recursively.
  - `handleToggleFolder()` finds the folder linearly.
  - `getDragItemName()` scans files/folders.
  - `deleteFolder()` server action fetches all folders and all notes, then filters in JS.

Risk:

- Tree operations are acceptable at small scale but degrade with thousands of nodes.
- Folder deletion does more data transfer than required.

Plan:

- Keep the tree virtualized and formalize it with tests for large counts.
- Use existing maps for all lookups.
- Move recursive folder operations into database RPCs.

Concrete tasks:

- [ ] Confirm `FileList` only renders the visible window and not all `flattenedVisibleItems`.
- [ ] Replace `folders.find()`/`files.find()` in hot paths with `foldersById`/`filesById`.
- [ ] Add a `delete_folder_recursive(folder_id)` RPC using a recursive CTE and one transaction.
- [ ] Add indexes on `(user_id, parent_id)` for folders and notes.
- [ ] Add benchmark test for 5k files / 1k folders tree render.

Expected impact:

- Faster interactions for big workspaces.
- Lower server/client data transfer for recursive folder deletes.

### 7. Rich Text Editor And Autosave

Current findings:

- `Editor` dynamically imports `RichTextEditor`, which is good.
- The BlockNote chunk is still large: 1291.8 KB raw / 382.4 KB gzip.
- `RichTextEditor.handleEditorChange()` calls `blocksToMarkdown(editor)` and clones/stringifies the full document after changes.
- `blocksToMarkdown()` calls `editor.blocksToMarkdownLossy()` asynchronously.
- Autosave delay is effectively 180 ms inside `RichTextEditor` plus 220 ms in `useDebouncedSave()`.
- `useDebouncedSave()` computes `markdownToRichDocument(content)` when `richContent` is not provided.
- `lastRichContentRef` uses `JSON.stringify(richContent ?? [])`.
- Shiki is dynamically imported for code highlighting, but the schema loads many languages when highlighter is needed.

Risk:

- Full-document serialization on every edit can cause input jank for long notes.
- The rich editor's initial async chunk is too expensive for raw-mode users if default mode is block or if accidental preloading occurs.
- Code highlighting can load too many language modules.

Plan:

- Avoid markdown serialization on each editor transaction.
- Treat BlockNote JSON as the primary editor state and derive markdown on idle/save/export.
- Increase debounce and coalesce serialization.
- Move heavy serialization to a Web Worker when document size crosses threshold.
- Lazy-load code highlighter only when a code block is present or inserted.

Concrete tasks:

- [ ] Instrument editor change duration with `performance.mark()` in development.
- [ ] Increase save debounce to 750 to 1000 ms while typing.
- [ ] Store rich content immediately and schedule markdown derivation with `requestIdleCallback`.
- [ ] For documents above a threshold, use a worker for markdown conversion or skip markdown until blur/manual export.
- [ ] Replace `JSON.stringify` equality checks with a revision counter or stable editor transaction id where possible.
- [ ] Avoid loading Shiki until a code block exists.
- [ ] Reduce Shiki languages to the app's most common set first, load rare languages on demand.
- [ ] Make raw editor default for low-power/mobile if measured BlockNote boot hurts INP/LCP.

Expected impact:

- Lower keystroke latency and fewer long tasks.
- Lower network write volume.
- Faster first interaction in editor-heavy sessions.

### 8. React Query, Zustand, And Render Churn

Current findings:

- React Query global `staleTime` is 60 seconds.
- `useApiMutation()` invalidates the optimistic query on every settled mutation by default.
- Autosave updates note cache optimistically, then writes server result back.
- Zustand store selectors are mostly narrow, but some components pull full store objects:
  - `SidebarPanel` calls `useSidebarStore()` without a selector.
  - `FileList` pulls multiple sidebar store methods and config.
- `sidebarPanelProps` is created as a new object on every `useNotesLayout()` render.
- Several returned callbacks in `useNotesLayout()` close over arrays and create new functions inline.

Risk:

- Broad Zustand subscriptions cause avoidable re-renders.
- Mutation invalidation after every autosave can refetch full notes list repeatedly.
- New prop objects reduce memo effectiveness.

Plan:

- Use selectors for Zustand stores.
- Avoid invalidating large list queries on autosave; update cache directly.
- Memoize large prop bundles.
- Add React Profiler checks for notes typing, sidebar search, and note switching.

Concrete tasks:

- [ ] Change `useApiMutation()` to allow `invalidateKeys: []` without falling back to optimistic key.
- [ ] Set autosave/update-note mutations to avoid list invalidation when cache was already patched.
- [ ] Use selectors in `SidebarPanel` and `FileList`.
- [ ] Memoize `sidebarPanelProps` in `useNotesLayout()`.
- [ ] Wrap heavy sidebar sections in `memo` only after prop identities are stable.
- [ ] Add a development render counter or React Profiler scenario for typing and search.

Expected impact:

- Fewer re-renders while typing.
- Lower Supabase traffic.
- Better sidebar responsiveness.

### 9. Supabase Schema, Queries, RLS, And RPCs

Current findings:

- Migrations in this repo cover AI tables, recents, and project planning tables.
- Migrations for core `notes`, `folders`, `journal_entries`, and `tags` tables are not present in this repo, but README says they exist in Supabase.
- App queries filter heavily by:
  - `user_id`
  - `deleted_at is null`
  - `parent_id`
  - `created_at`
  - `updated_at`
  - `date_key`
- `listNotes()`, `listFolders()`, `listJournalEntries()`, and `listJournalTags()` use broad list queries.
- `deleteJournalTag()` updates matching journal entries in a loop.
- `deleteFolder()` fetches all folders and all notes, then updates in batches.
- Project planning fetches six tables in parallel and then maps issues to features in JS.
- `has_role()` is a `security definer` function in `public`, which is common in Supabase RLS patterns but should be reviewed because exposed-schema definer functions need careful grants/search path.

Risk:

- Missing indexes create slow scans as data grows.
- Looping updates create N round trips.
- Broad table reads increase bandwidth and memory.
- Public project planning is read-heavy but always dynamic.

Plan:

- Add a migration for core content indexes after verifying actual remote schema.
- Add transactional RPCs for recursive delete and tag cleanup.
- Add server-side pagination/limits for large lists.
- Use Supabase advisors and `EXPLAIN (analyze, buffers)` on hot queries.

Recommended indexes:

```sql
create index if not exists notes_user_active_created_idx
  on public.notes (user_id, created_at)
  where deleted_at is null;

create index if not exists notes_user_active_parent_idx
  on public.notes (user_id, parent_id, created_at)
  where deleted_at is null;

create index if not exists notes_user_active_updated_idx
  on public.notes (user_id, updated_at desc)
  where deleted_at is null;

create index if not exists folders_user_active_parent_idx
  on public.folders (user_id, parent_id, created_at)
  where deleted_at is null;

create index if not exists journal_entries_user_active_date_idx
  on public.journal_entries (user_id, date_key)
  where deleted_at is null;

create index if not exists journal_entries_user_active_created_idx
  on public.journal_entries (user_id, created_at)
  where deleted_at is null;

create index if not exists tags_user_active_created_idx
  on public.tags (user_id, created_at)
  where deleted_at is null;
```

If server-side content search is added:

```sql
create extension if not exists pg_trgm;

create index if not exists notes_name_trgm_idx
  on public.notes using gin (name gin_trgm_ops)
  where deleted_at is null;
```

Concrete tasks:

- [ ] Pull or document the core content schema in migrations so performance work is reproducible.
- [ ] Run Supabase advisors before adding indexes.
- [ ] Add partial composite indexes for active rows.
- [ ] Add RPC for recursive folder soft delete.
- [ ] Add RPC for journal tag deletion and entry tag cleanup.
- [ ] Use `select` column lists everywhere. Avoid `select("*")`.
- [ ] Review `security definer` functions and grants. Keep `search_path` pinned and grant execute only where required.

Expected impact:

- Lower query latency and lower database CPU.
- Fewer network round trips on destructive operations.
- More predictable performance at large row counts.

### 10. API Routes And AI

Current findings:

- AI server routes import AI SDK providers on the server only, which is good for client bundles.
- `/api/ai` records usage/error telemetry around provider calls.
- `/api/ai/test-key` duplicates provider error classification logic from `/api/ai`.
- AI request body includes full markdown content, with `MAX_AI_CONTENT_CHARS` guarding size in constants.
- `/api/data/export` fetches all notes, folders, and journal entries, builds an in-memory zip, and returns one blob.
- `/api/account/delete` deletes user-scoped tables sequentially.

Risk:

- Export can use high server memory for large workspaces.
- Sequential account deletion increases latency and can partially fail.
- Duplicate AI error logic increases maintenance risk.

Plan:

- Stream large exports or put hard size/page limits in place.
- Use transactions/RPCs for account deletion data cleanup before auth user deletion.
- Share provider error classification.

Concrete tasks:

- [ ] Add workspace export size estimates and guardrails.
- [ ] Stream zip output if `fflate` in-memory output becomes large, or paginate exported rows.
- [ ] Move repeated provider error classification into `src/features/ai/provider-errors.ts`.
- [ ] For account deletion, create a server-side cleanup RPC or parallelize independent table deletes after evaluating constraints.
- [ ] Add request timing logs for AI and export routes.

Expected impact:

- Lower memory risk for export.
- More reliable destructive operations.
- Easier tuning of AI latency/error handling.

### 11. Project Planning

Current findings:

- Public page is dynamic and fetches:
  - features
  - issues
  - nice_to_haves
  - scratch_entries
  - planning_sections
  - planning_section_items
  - current user
  - role RPC for signed-in users
- Mapping feature -> issues likely scans issue rows per feature depending on mapper implementation.
- Public data is mostly read-only and seeded through migrations.

Risk:

- Anonymous visitors pay dynamic Supabase latency for content that could be cached.
- Admin state is coupled to public content.

Plan:

- Cache anonymous/public snapshot.
- Fetch admin state separately.
- Consider a database view or RPC returning the planning snapshot as nested JSON.

Concrete tasks:

- [ ] Split `fetchPlanningSnapshot()` into `fetchPublicPlanningSnapshot()` and `fetchPlanningAdminState()`.
- [ ] Add `revalidate = 60` or `unstable_cache` around public snapshot.
- [ ] Revalidate after admin actions.
- [ ] If row counts grow, add a `get_planning_snapshot()` RPC to aggregate server-side.
- [ ] Ensure planning table indexes match sort orders: `updated_at desc`, `created_at`, `sort_order`.

Expected impact:

- Faster anonymous project planning page.
- Lower Supabase reads.

### 12. Journal

Current findings:

- Journal entries and tags are listed broadly.
- `JournalStats` is dynamically imported from `journal-sidebar`.
- Journal components use `date-fns` from the package root.
- Journal tag deletion loops through entries.

Risk:

- Full journal history load grows with long-term use.
- Stats/export calculations can grow expensive.
- Root `date-fns` imports can hurt tree shaking depending on bundler behavior.

Plan:

- Add date-windowed journal queries.
- Load stats only when requested.
- Import date-fns functions from per-function paths if bundle inspection shows root imports pull too much.

Concrete tasks:

- [ ] Add `listJournalEntries({ from, to, limit })`.
- [ ] Prefetch only current month plus recent entries.
- [ ] Add a detail query for a single date.
- [ ] Move stats/export calculations off initial sidebar render.
- [ ] Replace tag cleanup loop with RPC.
- [ ] Run bundle diff after changing `date-fns` imports.

Expected impact:

- Faster journal boot for long-term users.
- Lower memory and CPU.

### 13. Settings

Current findings:

- AI settings and key manager are dynamically imported in `ai-section`.
- Tag manager is dynamically imported.
- Settings store persists a broad profile object locally.
- Account/security/data sections call API routes for export/deletion.

Risk:

- Broad store subscriptions can re-render settings sections unnecessarily.
- AI usage list can grow but API has limit/offset.

Plan:

- Keep settings section components split.
- Use selectors for settings store.
- Paginate AI usage in UI if not already.
- Avoid rendering heavy demos until their section is visible.

Concrete tasks:

- [ ] Audit settings components for broad `usePreferencesStore` subscriptions.
- [ ] Lazy mount section demos only when tab/section is active.
- [ ] Keep AI keys and tag manager dynamically imported.
- [ ] Add skeletons to avoid layout shifts when dynamic sections load.

Expected impact:

- Lower settings route hydration and re-render cost.

### 14. CSS, Animation, And Paint

Current findings:

- Framer Motion is global via `MotionConfig`.
- Notes mobile panels use motion and `willChange`.
- Global CSS sets focus-visible shadows for all elements.
- Auth PixelBlast animates WebGL background.
- Several UI surfaces use backdrop blur and shadows.

Risk:

- Global motion dependency can leak into routes that do not need it.
- Backdrop blur and large shadows can be expensive on low-end devices.
- `will-change` should be applied only during animation, not always.

Plan:

- Scope MotionConfig to routes/features with motion.
- Prefer CSS transitions for simple opacity/transform cases.
- Audit backdrop blur on sticky headers and overlays.
- Use reduced-motion paths to also skip loading motion-heavy code where possible.

Concrete tasks:

- [ ] Move `MotionConfig` out of global root provider.
- [ ] Replace simple `AnimatePresence` uses with CSS where exit animation is not critical.
- [ ] Apply `will-change` during drag/open states only.
- [ ] Check Chrome Performance paint profiler for sidebar open/close and metadata sheet.
- [ ] Reduce or remove blur on mobile overlays if paint cost is high.

Expected impact:

- Lower JS and paint cost.
- Better INP on mobile.

### 15. Icons And Shared UI

Current findings:

- Components import icons from `lucide-react`.
- Lucide generally tree-shakes, but many route surfaces import many icons.
- Some shared UI primitives may pull Radix packages globally when imported from route-level components.

Risk:

- Icon imports can add up across large client pages.
- Shared primitives used in root providers can increase all routes.

Plan:

- Keep icon imports local to components.
- Avoid importing icon-heavy components from root providers.
- Confirm route manifests after provider split.

Concrete tasks:

- [ ] After moving providers, rebuild and inspect auth/project-planning manifests.
- [ ] Avoid shared barrel exports that pull unrelated UI modules.
- [ ] Keep large icon groups out of top-level layout files.

Expected impact:

- Smaller route-specific chunks.

### 16. Mobile App

Current findings:

- Expo mobile shares Supabase-backed repositories.
- `mobile-cloud-repositories.ts` has generic list/create/update/delete operations and loads table rows.
- Mobile notes and journal screens use `useMemo` for filtering but likely operate on fully loaded arrays.
- Mobile package uses Expo Router, React Native 0.83, Zustand, Supabase.

Risk:

- Mobile is more sensitive to full-note payloads and JSON parse cost.
- Lists need virtualization by default.
- Supabase auth/session refresh and workspace bootstrap can block perceived startup.

Plan:

- Reuse metadata/detail split in mobile repositories.
- Use `FlatList` for note and journal lists.
- Cache metadata locally if offline UX is expected.
- Defer full note content until detail screen.

Concrete tasks:

- [ ] Add mobile metadata repository methods matching web.
- [ ] Change notes home to render metadata only.
- [ ] Fetch note body in detail screen.
- [ ] Use `FlatList` and stable `keyExtractor`.
- [ ] Add startup timing marks around auth, repository initialization, and first list render.

Expected impact:

- Faster mobile workspace startup.
- Lower memory pressure.

### 17. Observability, Benchmarks, And CI Gates

Current findings:

- There are unit and smoke tests.
- No obvious performance CI budget.
- Build output lacks bundle analysis plugin/report.

Plan:

- Add repeatable perf commands.
- Track route bundles, Lighthouse, and query timings.
- Add synthetic workspace fixtures.

Concrete tasks:

- [ ] Add `scripts/perf-build-report.mjs` to collect `.next/static` chunk sizes and route manifests.
- [ ] Add bundle budget JSON:
  - auth initial JS max
  - app shell initial JS max
  - rich editor async chunk max
- [ ] Add Playwright performance smoke:
  - sign-in page loads without editor/WebGL initial chunk when disabled/lazy
  - `/app` renders shell
  - note typing does not produce long tasks over threshold in fixture
- [ ] Add seeded large-workspace fixture: 1k notes, 5k notes, long note.
- [ ] Add Supabase query-plan checklist for migrations touching data access.
- [ ] Capture Web Vitals in production with route labels.

Expected impact:

- Prevents regressions after the first optimization pass.
- Makes performance work measurable instead of anecdotal.

## Prioritized Roadmap

### Phase 0: Measurement Baseline

Goal: make regressions visible before changing architecture.

- [ ] Add route chunk-size report from `.next/server/app/*/page_client-reference-manifest.js`.
- [ ] Add gzip size report for `.next/static/chunks`.
- [ ] Add manual profile scenarios:
  - `/sign-in` cold load.
  - `/app` cold load with small workspace.
  - `/app` cold load with 1k-note fixture.
  - type 20 seconds in a long BlockNote document.
  - search sidebar.
  - open metadata panel.
- [ ] Record baseline Web Vitals and long tasks.

Exit criteria:

- A markdown or JSON report can be generated locally after every build.
- We know current chunk sizes and can compare deltas.

### Phase 1: Low-Risk High-Impact Bundle And Hydration Wins

Goal: remove unnecessary JS from auth/public routes.

- [ ] Move `AppProviders` out of root layout.
- [ ] Scope `PersistenceBootstrap` and shortcuts to `/app`.
- [ ] Lazy-load/gate `PixelBlast`.
- [ ] Keep public/auth layouts mostly server-rendered.
- [ ] Rebuild and compare auth route manifests.

Exit criteria:

- Auth routes no longer load React Query workspace bootstrap.
- Auth routes no longer eagerly load `PixelBlast`/Three/postprocessing.
- Build passes.

### Phase 2: Notes Metadata/Detail Split

Goal: stop loading full workspace content on boot.

- [ ] Implement note metadata API and query keys.
- [ ] Implement active note detail API and query key.
- [ ] Migrate sidebar/tree/command palette to metadata.
- [ ] Migrate editor to active note detail.
- [ ] Migrate metadata panel to lazy detail/index queries.
- [ ] Remove full-list note body dependency.

Exit criteria:

- `/app` prefetches metadata and folders, not every note body.
- Opening a note fetches one note body.
- Existing note CRUD behavior remains intact.

### Phase 3: Database And Server Query Optimization

Goal: make Supabase fast at scale.

- [ ] Document/pull core content schema into migrations.
- [ ] Add partial composite indexes.
- [ ] Add recursive folder delete RPC.
- [ ] Add journal tag cleanup RPC.
- [ ] Add server search endpoint.
- [ ] Run advisors and query plans.

Exit criteria:

- Hot queries use indexes.
- Destructive recursive/tag actions use one server-side transaction.

### Phase 4: Editor Main-Thread Optimization

Goal: keep typing responsive for long documents.

- [ ] Add editor change timing instrumentation.
- [ ] Increase/coalesce debounce.
- [ ] Avoid markdown serialization per transaction.
- [ ] Move heavy conversion to idle/worker path.
- [ ] Lazy-load Shiki by actual code block usage.

Exit criteria:

- No visible typing jank on long notes.
- Autosave traffic is reduced.
- Rich editor chunk stays async.

### Phase 5: Search, Backlinks, And Derived Metadata

Goal: remove full-client scans.

- [ ] Add metadata columns or derived table for tags/title/outline/word count.
- [ ] Add `note_links` table or server backlink query.
- [ ] Replace client content search with server search.
- [ ] Paginate and cap results.

Exit criteria:

- Sidebar search does not require every note body in memory.
- Backlinks are not computed by scanning the whole workspace in the browser.

### Phase 6: Mobile Parity

Goal: apply the same data-shape wins to Expo.

- [ ] Add metadata/detail repository methods.
- [ ] Fetch detail content only on detail screens.
- [ ] Use virtualized lists everywhere.
- [ ] Add startup metrics.

Exit criteria:

- Mobile home screens render from metadata only.
- Large workspaces do not require full body load at startup.

## Micro-Optimization Checklist

Use this only after the larger phases above; these are not substitutes for data/hydration fixes.

- [ ] Replace root `date-fns` imports with per-function imports if bundle diff shows savings.
- [ ] Avoid `new Blob([file.content]).size` in `MetadataPanel`; use `new TextEncoder().encode(content).byteLength` or precomputed byte count.
- [ ] Cache `extractNoteTags(content)` per note revision.
- [ ] Prebuild note title index once per metadata array.
- [ ] Avoid `Object.fromEntries(Object.entries(...).filter())` for frequent save-state deletion; copy and `delete`.
- [ ] Use maps for drag item lookup in `FileList`.
- [ ] Avoid `window.history.pushState` duplicates when selected note is already in the URL.
- [ ] Avoid body overflow writes unless the value actually changes.
- [ ] Batch save-state updates when multiple files are affected.
- [ ] Do not invalidate full note metadata on every autosave.
- [ ] Prefer CSS animation for simple opacity/translate.
- [ ] Remove unused `createSyntaxHighlightedCodeBlockSpec()` if it is confirmed dead.
- [ ] Keep `will-change` scoped to active animation/drag windows.
- [ ] Convert broad Zustand subscriptions to selectors.
- [ ] Memoize prop objects passed to memoized sections.
- [ ] Add `limit` to recent/history APIs and UI lists.
- [ ] Use column lists instead of `select("*")`.
- [ ] Prefer RPCs for multi-row mutations that must stay consistent.

## Suggested Issue Breakdown

1. `perf: add build chunk report and budgets`
2. `perf: scope root providers to authenticated app routes`
3. `perf: lazy load auth PixelBlast background`
4. `perf(notes): split metadata and note detail queries`
5. `perf(notes): remove full-content dependency from sidebar search`
6. `perf(notes): optimize backlink index construction`
7. `perf(db): add content table indexes and recursive delete RPC`
8. `perf(editor): coalesce BlockNote serialization and autosave`
9. `perf(journal): date-window journal queries`
10. `perf(project-planning): cache public planning snapshot`
11. `perf(mobile): metadata-first workspace boot`

## Verification Commands

```bash
bun run build
bun run test:unit
bun run lint
```

After adding perf scripts:

```bash
bun run perf:build
bun run perf:fixtures
```

Manual checks:

- Inspect `.next/server/app/(auth)/sign-in/page_client-reference-manifest.js`.
- Inspect `.next/server/app/app/page/react-loadable-manifest.json`.
- Compare gzip sizes of chunks over 100 KB.
- Run Chrome Performance traces for:
  - auth page cold load
  - app page cold load
  - first BlockNote load
  - long-note typing
  - sidebar search
  - metadata panel open

## Open Questions

- Is BlockNote required as the default editor for all users, or can raw mode be default on mobile/low-power devices?
- Should public project planning be real-time fresh, or is 30 to 60 second ISR acceptable?
- Should note search include full body matches on every keystroke, or can body search be explicit after title/tag results?
- Should rich markdown be canonical, BlockNote JSON canonical, or both? This affects how much serialization can be deferred.
- Is offline-first sync a near-term requirement for mobile? If yes, the metadata/detail split should be designed with local caching now.

