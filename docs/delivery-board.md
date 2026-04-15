# Delivery Board

## Objective

Deliver a strong web app and a strong mobile app with simple product scope and scalable architecture.

## Scope Lock

### In Scope

- notes
- folders
- journal
- guest mode
- authenticated mode
- profile summary/settings
- polished web UX
- polished mobile UX
- scalable, portable architecture

### Out of Scope

- sync engine
- offline conflict resolution
- collaboration
- filesystem integration
- plugin architecture
- AI-heavy editor workflows

## Status Model

Use only these statuses:

- `todo`
- `in_progress`
- `blocked`
- `done`

## Parallel Work Rules

- one owner per task
- avoid overlapping write ownership unless coordinated
- shared contracts should land before downstream rewires depend on them
- UI work should not rewrite persistence logic unless explicitly assigned
- testing can run in parallel, but should avoid feature refactors unless owned

## Workstreams

### WS-A: Session and Auth Simplification

**Status:** `in_progress`  
**Priority:** `P0`  
**Owner:** `Agent 1`

**Goal**

Make session behavior explicit and simple: `guest` or `authenticated`.

**Primary Files**

- [src/platform/auth/index.ts](/home/remco/dev/haptic-ui-clone/src/platform/auth/index.ts)
- [src/platform/auth/use-auth.ts](/home/remco/dev/haptic-ui-clone/src/platform/auth/use-auth.ts)
- [src/features/auth/components/app-auth-gate.tsx](/home/remco/dev/haptic-ui-clone/src/features/auth/components/app-auth-gate.tsx)
- [src/features/auth/components/auth-entry-point.tsx](/home/remco/dev/haptic-ui-clone/src/features/auth/components/auth-entry-point.tsx)

**Definition of Done**

- one canonical session model exists
- guest/authenticated behavior is easy to trace
- feature stores do not depend on hidden auth semantics
- tests cover key transitions

### WS-B: Repository Boundary and Persistence Selection

**Status:** `in_progress`  
**Priority:** `P0`  
**Owner:** `Agent 2`

**Goal**

Make persistence selection explicit and portable.

**Primary Files**

- [src/core/persistence/repositories/index.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/index.ts)
- [src/core/persistence/repositories/notes-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/notes-repository.ts)
- [src/core/persistence/repositories/folders-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/folders-repository.ts)
- [src/core/persistence/repositories/journal-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/journal-repository.ts)
- [src/core/persistence/repositories/local-backend.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/local-backend.ts)
- [src/core/persistence/supabase/client.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/supabase/client.ts)

**Definition of Done**

- one explicit local/cloud selection path exists
- guest writes never touch cloud
- authenticated writes never touch guest local content
- repository interfaces are usable by web and mobile

### WS-C: Shared Domain Extraction

**Status:** `in_progress`  
**Priority:** `P0`  
**Owner:** `Agent 3`

**Goal**

Centralize portable domain logic before web and mobile diverge further.

**Definition of Done**

- portable domain logic is centralized
- web and mobile use the same core contracts
- no shared UI abstraction creep
- future extraction to a shared package is straightforward

### WS-D: Bootstrap and Store Hydration Simplification

**Status:** `todo`  
**Priority:** `P1`  
**Owner:** `Unassigned`

**Goal**

Reduce startup complexity and keep stores focused on feature state.

**Primary Files**

- [src/shared/components/persistence-bootstrap.tsx](/home/remco/dev/haptic-ui-clone/src/shared/components/persistence-bootstrap.tsx)
- [src/providers/app-providers.tsx](/home/remco/dev/haptic-ui-clone/src/providers/app-providers.tsx)
- [src/features/notes/store.ts](/home/remco/dev/haptic-ui-clone/src/features/notes/store.ts)
- [src/features/journal/store.ts](/home/remco/dev/haptic-ui-clone/src/features/journal/store.ts)
- [src/features/settings/store.ts](/home/remco/dev/haptic-ui-clone/src/features/settings/store.ts)
- [src/features/layout/store.ts](/home/remco/dev/haptic-ui-clone/src/features/layout/store.ts)
- [src/features/notes/components/sidebar/store.ts](/home/remco/dev/haptic-ui-clone/src/features/notes/components/sidebar/store.ts)

**Definition of Done**

- app initialization is simpler
- stores do not orchestrate auth rules
- bootstrap code is thin
- store tests remain green or improve

### WS-E: Web App Stabilization

**Status:** `todo`  
**Priority:** `P1`  
**Owner:** `Unassigned`

**Goal**

Make the web app feel finished without expanding product scope.

**Primary Files**

- [src/features/journal/components/journal-database-view.tsx](/home/remco/dev/haptic-ui-clone/src/features/journal/components/journal-database-view.tsx)
- [src/features/journal/components/journal-page-layout.tsx](/home/remco/dev/haptic-ui-clone/src/features/journal/components/journal-page-layout.tsx)
- [src/features/layout/components/icon-rail.tsx](/home/remco/dev/haptic-ui-clone/src/features/layout/components/icon-rail.tsx)
- [src/features/notes/components/file-list.tsx](/home/remco/dev/haptic-ui-clone/src/features/notes/components/file-list.tsx)
- [src/features/notes/components/sidebar-panel.tsx](/home/remco/dev/haptic-ui-clone/src/features/notes/components/sidebar-panel.tsx)
- [src/shared/ui/context-menu.tsx](/home/remco/dev/haptic-ui-clone/src/shared/ui/context-menu.tsx)
- [src/shared/ui/sheet.tsx](/home/remco/dev/haptic-ui-clone/src/shared/ui/sheet.tsx)

**Definition of Done**

- note creation/edit/navigation feels stable
- journal flows feel stable
- folder/file interactions are robust
- context actions and sheets are consistent
- responsive behavior is intentional

### WS-F: Mobile App Upgrade to Production-Quality Foundation

**Status:** `todo`  
**Priority:** `P1`  
**Owner:** `Unassigned`

**Goal**

Turn the Expo app from a usable scaffold into a solid app foundation.

**Primary Files**

- [apps/mobile/app/(tabs)/_layout.tsx](/home/remco/dev/haptic-ui-clone/apps/mobile/app/(tabs)/_layout.tsx)
- [apps/mobile/src/features/notes/notes-home-screen.tsx](/home/remco/dev/haptic-ui-clone/apps/mobile/src/features/notes/notes-home-screen.tsx)
- [apps/mobile/src/features/notes/note-detail-screen.tsx](/home/remco/dev/haptic-ui-clone/apps/mobile/src/features/notes/note-detail-screen.tsx)
- [apps/mobile/src/features/journal/journal-home-screen.tsx](/home/remco/dev/haptic-ui-clone/apps/mobile/src/features/journal/journal-home-screen.tsx)
- [apps/mobile/src/features/journal/journal-detail-screen.tsx](/home/remco/dev/haptic-ui-clone/apps/mobile/src/features/journal/journal-detail-screen.tsx)
- [apps/mobile/src/features/profile/profile-screen.tsx](/home/remco/dev/haptic-ui-clone/apps/mobile/src/features/profile/profile-screen.tsx)

**Definition of Done**

- notes flow is reliable
- journal flow is reliable
- profile/reset flow is reliable
- starter data and local persistence are stable
- mobile app passes typecheck and manual acceptance checks

### WS-G: Brand and Design System Unification

**Status:** `todo`  
**Priority:** `P2`  
**Owner:** `Unassigned`

**Goal**

Unify product identity and prevent visual drift.

**Primary Files**

- [src/app/layout.tsx](/home/remco/dev/haptic-ui-clone/src/app/layout.tsx)
- [src/shared/ui/logo.tsx](/home/remco/dev/haptic-ui-clone/src/shared/ui/logo.tsx)
- [public/manifest.json](/home/remco/dev/haptic-ui-clone/public/manifest.json)
- [apps/mobile/app.json](/home/remco/dev/haptic-ui-clone/apps/mobile/app.json)

**Definition of Done**

- branding is consistent
- icons and metadata are production-ready
- no visible naming drift remains
- lightweight design guidance exists

### WS-H: Testing and Release Hardening

**Status:** `in_progress`  
**Priority:** `P0`  
**Owner:** `Agent 8`

**Goal**

Put regression protection around the core before polish outruns reliability.

**Primary Files**

- [tests/smoke/auth-and-privacy.spec.ts](/home/remco/dev/haptic-ui-clone/tests/smoke/auth-and-privacy.spec.ts)
- [apps/mobile/package.json](/home/remco/dev/haptic-ui-clone/apps/mobile/package.json)

**Definition of Done**

- critical persistence/session logic is covered
- web smoke tests catch basic regressions
- mobile has at least typecheck plus manual acceptance checklist
- release process is documented and reproducible

## Phase Plan

| Phase | Name | Status | Included |
|---|---|---|---|
| 0 | Baseline and Guardrails | `done` | tracking doc, commands, owners, acceptance criteria |
| 1 | Core Foundation | `in_progress` | WS-A, WS-B, WS-C, WS-H |
| 2 | App Runtime Simplification | `todo` | WS-D, WS-H |
| 3 | Product Experience | `todo` | WS-E, WS-F, WS-G, WS-H |
| 4 | Release Readiness | `todo` | regression sweep, QA, cut list |

## Task Register

| ID | Workstream | Task | Owner | Status | Depends On | Notes |
|---|---|---|---|---|---|---|
| A1 | WS-A | Define canonical session model | Agent 1 | `done` | - | Auth snapshot now centers on `phase` and `workspaceMode` |
| A2 | WS-A | Remove or isolate actor-style auth complexity | Unassigned | `todo` | A1 | Keep external behavior stable |
| A3 | WS-A | Document session states and transitions | Unassigned | `todo` | A1 | Short ADR-style note is enough |
| B1 | WS-B | Define repository factory/provider | Agent 2 | `done` | A1 | Composition root now lives in repository index |
| B2 | WS-B | Enforce guest-local and auth-cloud rules | Agent 2 | `in_progress` | B1 | Explicit userId is now required for remote CRUD; broader consumer cleanup remains |
| B3 | WS-B | Reduce implicit repository selection paths | Unassigned | `todo` | B1 | Remove ad hoc routing where possible |
| C1 | WS-C | Define shared domain module boundaries | Agent 3 | `in_progress` | A1, B1 | Shared starter-content extraction is now landed |
| C2 | WS-C | Move shared types/contracts/builders | Agent 3 | `in_progress` | C1 | Starter-content and repository contracts are now landed |
| C3 | WS-C | Centralize neutral validators/helpers | Agent 3 | `in_progress` | C1 | Shared `createId` and `toDateKey` are now landed |
| D1 | WS-D | Simplify bootstrap path | Unassigned | `todo` | A1, B1 | Reduce top-level coordination |
| D2 | WS-D | Simplify store hydration flow | Unassigned | `todo` | D1 | Keep stores feature-focused |
| D3 | WS-D | Reduce stale-session and actor leftovers | Unassigned | `todo` | D1 | Remove dead complexity carefully |
| E1 | WS-E | Finish note/file tree UX | Unassigned | `todo` | - | Current largest active WIP area |
| E2 | WS-E | Finish journal shell/editor UX | Unassigned | `todo` | - | Includes navigation consistency |
| E3 | WS-E | Stabilize responsive web behavior | Unassigned | `todo` | E1, E2 | Preserve keyboard-first behavior |
| E4 | WS-E | Normalize web shell controls and visual language | Unassigned | `todo` | E1, E2 | Coordinate with WS-G |
| F1 | WS-F | Validate mobile notes flows | Unassigned | `todo` | - | Guest flow first |
| F2 | WS-F | Validate mobile journal flows | Unassigned | `todo` | - | Guest flow first |
| F3 | WS-F | Improve mobile touch and state UX | Unassigned | `todo` | F1, F2 | Loading, empty, error states |
| F4 | WS-F | Align mobile with shared domain and repositories | Unassigned | `todo` | B1, C1 | No cloud auth yet |
| G1 | WS-G | Finalize Skriuw branding rollout | Unassigned | `todo` | - | Remove naming drift |
| G2 | WS-G | Finalize PWA/app metadata and assets | Unassigned | `todo` | G1 | Web + mobile metadata |
| G3 | WS-G | Write lightweight design guidance | Unassigned | `todo` | G1 | Color, type, spacing, icon rules |
| H1 | WS-H | Build quality checklist | Agent 8 | `done` | - | Commands plus manual checks |
| H2 | WS-H | Add tests for session and repository invariants | Unassigned | `todo` | A1, B1 | Highest-value test additions |
| H3 | WS-H | Expand smoke coverage for critical flows | Unassigned | `todo` | E1, E2 | Notes and journal |
| H4 | WS-H | Add mobile validation checklist and typecheck gate | Unassigned | `todo` | F1, F2 | Manual plus scripted |

## Dependency Notes

### Hard Dependencies

- WS-D depends on WS-A and WS-B
- later WS-F architecture cleanup should align with WS-B and WS-C
- release readiness depends on WS-H throughout

### Soft Dependencies

- WS-E should coordinate with WS-G for naming and tokens
- WS-F should coordinate with WS-G for metadata and visual consistency
- WS-H should shadow every phase, not wait until the end

## Current Findings

### WS-A Findings

- auth no longer needs `mode`, `status`, or `canSync` on the real snapshot type
- `signed_out` is now treated as `phase: guest` plus `workspaceMode: cloud`, which is simpler and matches product behavior better
- migrated consumers now include auth entry point, profile view model, profile summary, settings modal, persistence bootstrap, and workspace target resolution
- there are currently no remaining `auth.mode`, `auth.status`, or `auth.canSync` reads under `src/`
- recommended target shape:
  - `phase`: `initializing | guest | authenticated`
  - `workspaceMode`: `guest | cloud`
  - `rememberMe`, `isSupabaseConfigured`, `user`, `session`, `error`

### WS-B Findings

- repository selection is currently implicit inside each repository method
- `workspace-target.ts` is the main selector today, but lower layers still re-read auth state
- recommended direction is one composition root in [src/core/persistence/repositories/index.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/index.ts)
- remote record helpers should require explicit `userId` instead of falling back to live auth state
- first transition slice is now in code:
  - [src/core/persistence/repositories/index.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/index.ts) now owns the repository composition root
  - notes, folders, and journal repositories now expose target-specific builders instead of making selection decisions in their singleton methods
  - [src/core/persistence/supabase/records.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/supabase/records.ts) now requires explicit `userId` for remote CRUD helpers

### WS-C Findings

- best low-risk first extraction is shared starter/demo content
- next lowest-risk extraction is repository contract types
- `createId` and `toDateKey` are good early shared helpers
- rich document types should stay web-specific for now
- first concrete extraction is now in code:
  - [src/core/shared/starter-content.ts](/home/remco/dev/haptic-ui-clone/src/core/shared/starter-content.ts) owns the shared starter/demo content source
  - [src/core/persistence/repositories/privacy-demo.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/privacy-demo.ts) now maps web persistence records from that shared source
  - [apps/mobile/src/core/starter-data.ts](/home/remco/dev/haptic-ui-clone/apps/mobile/src/core/starter-data.ts) now reads from the same shared source
  - [src/core/persistence/repositories/contracts.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/contracts.ts) now holds shared repository contracts and workspace-target types
  - [src/core/shared/time.ts](/home/remco/dev/haptic-ui-clone/src/core/shared/time.ts) now holds shared `createId` and `toDateKey`, with mobile consuming that helper

### WS-H Findings

- verified checks:
  - `bun run test` passes
  - `bun run lint` passes with one warning
  - `bun --filter @skriuw/mobile typecheck` passes
- current targeted verification after the auth slice:
  - `bun test src/platform/auth/__tests__/index.test.ts src/features/profile/lib/__tests__/profile-view-model.test.ts src/shared/components/__tests__/persistence-bootstrap.test.tsx` passes
- current targeted verification after the auth consumer migration:
  - `bun test src/core/persistence/repositories/__tests__/workspace-target.test.ts src/shared/components/__tests__/persistence-bootstrap.test.tsx src/platform/auth/__tests__/index.test.ts` passes
- current targeted verification after the repository slice:
  - `bun test src/platform/auth/__tests__/index.test.ts src/shared/components/__tests__/persistence-bootstrap.test.tsx src/features/profile/lib/__tests__/profile-view-model.test.ts src/core/persistence/repositories/__tests__/supabase-routing.test.ts src/core/persistence/repositories/__tests__/workspace-target.test.ts src/core/persistence/supabase/__tests__/records.test.ts` passes
- current deterministic foundation verification:
  - `bun test src/core/persistence/repositories/__tests__/privacy-demo.test.ts src/core/persistence/supabase/__tests__/sync.test.ts src/core/persistence/supabase/__tests__/records.test.ts src/platform/auth/__tests__/index.test.ts src/shared/components/__tests__/persistence-bootstrap.test.tsx src/core/persistence/repositories/__tests__/workspace-target.test.ts src/core/persistence/repositories/__tests__/supabase-routing.test.ts src/features/profile/lib/__tests__/profile-view-model.test.ts` passes
- raw `bun test` still discovers the Playwright smoke spec and should not be treated as the repo gate
- coverage is strongest in persistence/session/store invariants
- current gaps are browser flow depth and mobile automated coverage

## Immediate Next Implementation Order

1. Continue `B2` by removing remaining implicit cloud/local routing assumptions from downstream consumers and tests.
2. Continue `C2`/`C3` with additional neutral shared helpers and portable contracts where they reduce real duplication.
3. Start `H2` immediately on top of the new auth and repository boundaries.
4. Begin `D1` once the current foundation diff is stabilized.
5. Keep `H1` as the documented command baseline until the smoke-test discovery issue is fully isolated from raw `bun test`.

## Ownership Matrix

| Area | Preferred Owner |
|---|---|
| session/auth | Agent 1 |
| repositories/persistence | Agent 2 |
| shared domain/contracts | Agent 3 |
| bootstrap/store hydration | Agent 4 |
| web UX | Agent 5 |
| mobile UX | Agent 6 |
| brand/design | Agent 7 |
| tests/release hardening | Agent 8 |

## Decisions Log

| Date | Decision | Notes |
|---|---|---|
| 2026-04-15 | Product scope remains intentionally simple | Strong web + mobile, scalable architecture, no sync engine |
| 2026-04-15 | Track work in-repo via this document | Keeps chat and execution aligned |
| 2026-04-15 | Prioritize core architecture before large platform-specific rewrites | Session, repository, and shared domain first |

## Acceptance Criteria

### Web App

- create, edit, and delete note works
- create, edit, and delete folder works
- move notes between folders works
- search and navigation are stable
- journal create, edit, and delete works
- editor mode switching works
- responsive layout is stable
- keyboard navigation remains strong

### Mobile App

- app opens directly into a coherent guest experience
- create, edit, and delete note works
- create, edit, and delete journal entry works
- profile metrics and reset work
- empty, loading, and error states are clean
- navigation is obvious
- touch targets are reliable

### Architecture

- one clear session model
- one clear repository selection path
- domain logic is portable
- platform code remains at the edges
- feature stores are not auth orchestration engines

### Quality

- lint passes
- web tests pass
- mobile typecheck passes
- smoke checks cover critical flows
- release checklist exists

## Release Checklist

### Commands

- `bun run lint`
- `bun run test`
- `bun run test:smoke`
- `bun --filter @skriuw/mobile typecheck`

### Known Caveats

- raw `bun test` is not the intended repo gate because Bun discovers the Playwright smoke spec in `tests/smoke/`
- current lint state includes one unused-import warning in [src/features/profile/components/profile-page.tsx](/home/remco/dev/haptic-ui-clone/src/features/profile/components/profile-page.tsx:8)

### Manual Web QA

- verify notes CRUD
- verify folder CRUD and movement
- verify journal CRUD
- verify editor mode switching
- verify responsive behavior at mobile and desktop widths
- verify auth entry and guest entry behavior

### Manual Mobile QA

- verify guest workspace loads
- verify notes CRUD
- verify journal CRUD
- verify profile metrics/reset
- verify app relaunch persistence
- verify loading and empty states

## Current Snapshot

### Current Branch

- `feature/expo-foundation`

### Current Reality

- Expo mobile guest foundation exists
- web app is established and usable
- active WIP is concentrated in web UX polish, mobile-oriented interactions, and branding assets
- core architecture cleanup is still the main structural next step

## Next Actions

1. Assign owners for WS-A, WS-B, WS-C, and WS-H.
2. Move `A1`, `B1`, `C1`, and `H1` to `in_progress`.
3. Keep WS-E limited to isolated UX stabilization until WS-A and WS-B outputs are clearer.
4. Keep WS-F focused on guest-flow validation and UX until shared domain and repository boundaries settle.
