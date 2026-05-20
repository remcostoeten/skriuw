# App Structure Audit Report

Scope: actual web app code only. Mobile and architecture docs were ignored.

## Implementation Status

Implemented after this audit:

- Added `src/domain/recents/types.ts` and removed the `src/domain/recents` dependency on notes sidebar UI types.
- Moved AI constants, types, key utilities, provider-key persistence, usage, usage utilities, and telemetry into `src/domain/ai`.
- Moved product persistence types into `src/domain/persistence/types.ts`, leaving `src/core/persistence-types.ts` as a compatibility re-export.
- Moved note and journal product models into `src/domain/notes/models.ts` and `src/domain/journal/models.ts`, leaving `src/types/*` as compatibility re-exports.
- Moved starter content into `src/domain/seed/starter-content.ts` and rich-document parsing into `src/domain/notes/rich-document.ts`, leaving `src/shared/lib/*` as compatibility re-exports.
- Kept thin compatibility re-exports in `src/features/ai` so feature/UI imports can migrate gradually.
- Moved stale tests from `__tests__/core` and `__tests__/shared/components` into folders that match actual ownership.
- Changed the full unit test command to `bun test --isolate __tests__` so all unit tests run without cross-file mock leakage.

Still pending:

- Decouple editor-specific preference parsing from `src/platform/auth`.
- Avoid future seed/content migrations in `supabase/migrations`.

## Current Actual Structure

```txt
src/app       routes, pages, layouts, route handlers
src/features  UI, hooks, stores, feature workflows, some feature-owned server/data logic
src/domain    reusable product database APIs, row mappers, product input types
src/core      Supabase clients, shortcuts, plus product persistence primitive types
src/platform  auth/session integration
src/shared    reusable UI/icons/helpers, plus some product-specific document/seed helpers
src/providers app-level provider composition and persistence bootstrapping
src/types     global product types for notes and journal
```

The structure is mostly coherent, but there are a few places where lower-level or reusable folders know too much about product/UI concepts.

## Confirmed Boundary Issues

### 1. `src/core` owns product persistence types

[src/core/persistence-types.ts](/home/remcostoeten/dev/skriuw/src/core/persistence-types.ts:1) used to import global product types from `@/types/journal` and `@/types/notes`, then define persisted note, folder, journal, tag, and store-name concepts.

Previous issue: `src/core` was partly infrastructure and partly product persistence schema.

Status: fixed. The real definitions now live in `src/domain/persistence/types.ts`, and `src/core/persistence-types.ts` is only a compatibility re-export.

Preferred direction:

```txt
src/domain/notes/types.ts
src/domain/folders/types.ts
src/domain/journal/types.ts
src/domain/persistence/types.ts   cross-entity persisted record types
```

### 2. `src/domain` imports a UI feature type

[src/domain/recents/api.ts](/home/remcostoeten/dev/skriuw/src/domain/recents/api.ts:4) now imports `RecentItem` from `@/domain/recents/types`.

Previous issue: reusable domain data access depended on a notes sidebar UI type.

Status: fixed. The notes sidebar re-exports the domain type for compatibility.

### 3. `src/types` is a global product type bucket

[src/types/notes.ts](/home/remcostoeten/dev/skriuw/src/types/notes.ts:1) and [src/types/journal.ts](/home/remcostoeten/dev/skriuw/src/types/journal.ts:1) used to own global product model types that were imported from domain, features, shared, tests, and core.

Previous issue: ownership was unclear. New product concepts could end up global by default.

Status: fixed for the current note/journal models. The real definitions now live under `src/domain/notes/models.ts` and `src/domain/journal/models.ts`; `src/types/*` are compatibility re-exports only.

### 4. `src/shared/lib` contains product-specific helpers

[src/shared/lib/starter-content.ts](/home/remcostoeten/dev/skriuw/src/shared/lib/starter-content.ts:1) used to build notes, folders, and journal starter content.

[src/shared/lib/rich-document.ts](/home/remcostoeten/dev/skriuw/src/shared/lib/rich-document.ts:6) used to import `RichTextDocument` and encode product/editor concepts such as note links, tags, and file trees.

Previous issue: useful code, but not generic shared infrastructure.

Status: fixed. Starter content now lives in `src/domain/seed/starter-content.ts`; rich document logic now lives in `src/domain/notes/rich-document.ts`.

### 5. `src/platform/auth` knows editor preferences

[src/platform/auth/index.ts](/home/remcostoeten/dev/skriuw/src/platform/auth/index.ts:8) imports editor font validation and handles editor preference metadata.

Issue: auth/session infrastructure knows product preference shape.

Decision: platform should expose generic profile/user-metadata primitives. Settings/editor should parse and own editor preference semantics.

### 6. `src/providers` reaches into feature internals

[src/providers/persistence-bootstrap.tsx](/home/remcostoeten/dev/skriuw/src/providers/persistence-bootstrap.tsx:6) imports notes, settings, and nested notes sidebar stores directly.

Issue: app bootstrapping is reaching into feature internals.

Decision: acceptable for now, but long term each feature should expose a small bootstrap/reset facade.

## Feature Findings

### Tight

`project-planning` is the tightest feature. UI, local types, and server logic are colocated under `src/features/project-planning`, with DB logic isolated under `server`.

`journal` data hooks are reasonably clean because they go through `src/domain/journal/api`.

### Loose

`editor` imports notes-specific behavior directly. Examples include note links, tag behavior, notes store access, and create-note hooks inside editor components/specs.

`layout` imports notes-specific constants/icons in [src/features/layout/components/app-loading-shell.tsx](/home/remcostoeten/dev/skriuw/src/features/layout/components/app-loading-shell.tsx:25).

`settings` naturally crosses feature boundaries, but some logic is more than presentation. [src/features/settings/actions/clear-data.ts](/home/remcostoeten/dev/skriuw/src/features/settings/actions/clear-data.ts:3) is a cross-domain data action and should eventually become domain/workspace/account service code.

`ai` previously had persistent server/data logic in the feature root. Provider keys, usage, and telemetry are reused by API routes and settings, so they behave more like a product domain than a UI-only feature.

Preferred direction:

```txt
src/domain/ai              persisted keys, usage, telemetry, provider policy
src/features/ai            UI/client affordances and feature-specific presentation
src/features/ai/server     acceptable interim step if a full domain move is too much
```

Status: fixed for persistence/domain code. The implementation now lives under `src/domain/ai`, with feature-level re-export shims left in place for compatibility.

## Migration Findings

Most migrations are proper schema migrations.

Non-agnostic migrations:

- [supabase/migrations/20260516120100_seed_project_planning.sql](/home/remcostoeten/dev/skriuw/supabase/migrations/20260516120100_seed_project_planning.sql:1)
- [supabase/migrations/20260517120000_clean_project_planning_real_issues.sql](/home/remcostoeten/dev/skriuw/supabase/migrations/20260517120000_clean_project_planning_real_issues.sql:1)

These insert/delete roadmap content and should not be the pattern going forward.

Future convention:

```txt
supabase/migrations/*   schema and true production data transformations only
supabase/seed.sql       local/dev seed data, demo rows, placeholder content
scripts/*.sql           explicit one-off admin/backfill scripts
```

Naming:

```txt
create_<domain>_<object>.sql
add_<domain>_<capability>.sql
migrate_<old>_to_<new>_<field_or_concept>.sql
backfill_<domain>_<reason>.sql
```

Guardrail: flag migrations containing `insert into`, `delete from`, or `update` unless the filename starts with `migrate_` or `backfill_` and the change is a real production data transformation.

## Test Findings

Tests mostly work. The stale ownership paths found by the audit have been moved:

- `__tests__/domain/journal/mappers.test.ts`
- `__tests__/domain/notes/mappers.test.ts`
- `__tests__/shared/lib/starter-content.test.ts`
- `__tests__/providers/persistence-bootstrap.test.tsx`

[package.json](/home/remcostoeten/dev/skriuw/package.json:31) now runs all unit tests under `__tests__` with file isolation.

Preferred test layout:

```txt
__tests__/domain/journal/mappers.test.ts
__tests__/domain/notes/mappers.test.ts
__tests__/shared/lib/starter-content.test.ts
__tests__/providers/persistence-bootstrap.test.tsx
__tests__/platform/auth/index.test.ts
__tests__/features/<feature>/...
tests/smoke/...
```

Current test command:

```txt
bun test --isolate __tests__
```

File isolation is required because some tests use `mock.module`, and a single shared global context causes mock leakage across unrelated store tests.

## What To Leave Alone

```txt
src/core/supabase
src/core/shortcuts
src/shared/ui
src/shared/icons
src/shared/lib/utils.ts
src/shared/lib/time.ts
src/shared/lib/avatar.ts
src/shared/lib/file-tree.ts
src/platform/auth/use-auth.ts
src/features/project-planning/server
src/features/notes/server/backlinks.ts
```

## Cleanup Roadmap

### First pass

1. Done: add `src/domain/recents/types.ts` and remove the domain dependency on notes sidebar types.
2. Done: move test files whose paths are clearly stale.
3. Done: change test scripts to include all unit tests under `__tests__`.
4. Policy only: stop putting seed/content rows into migrations.

### Second pass

1. Done: move starter content from `src/shared/lib/starter-content.ts` to `src/domain/seed`.
2. Done: move AI persistence/server modules toward `src/domain/ai`.
3. Extract feature bootstrap/reset facades so `src/providers/persistence-bootstrap.tsx` does not import nested feature stores.

### Third pass

1. Done: move note/journal product types out of `src/types`.
2. Done: move product persistence types out of `src/core/persistence-types.ts`.
3. Done: move product-specific starter/document helpers out of `src/shared/lib`.
4. Done: decouple editor preference parsing from `src/platform/auth`.

## Future Rules

```txt
src/app       composes routes only
src/features  owns UI, hooks, stores, and feature-private server logic
src/domain    owns reusable product data APIs, mappers, and product types
src/core      owns infrastructure only
src/platform  owns runtime/auth integration, not product preferences
src/shared    owns generic reusable UI/helpers only
src/types     legacy; do not add new concepts
```

Low-cost guardrails:

```txt
- no src/domain imports from src/features
- no product-specific imports from src/core
- no new src/types files without explicit exception
- no seed/demo rows in schema migrations
- route files under src/app stay thin
```
