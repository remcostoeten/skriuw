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

**Status:** `todo`  
**Priority:** `P0`  
**Owner:** `Unassigned`

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

**Status:** `todo`  
**Priority:** `P0`  
**Owner:** `Unassigned`

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

**Status:** `todo`  
**Priority:** `P0`  
**Owner:** `Unassigned`

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

**Status:** `todo`  
**Priority:** `P0`  
**Owner:** `Unassigned`

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
| 0 | Baseline and Guardrails | `todo` | tracking doc, commands, owners, acceptance criteria |
| 1 | Core Foundation | `todo` | WS-A, WS-B, WS-C, WS-H |
| 2 | App Runtime Simplification | `todo` | WS-D, WS-H |
| 3 | Product Experience | `todo` | WS-E, WS-F, WS-G, WS-H |
| 4 | Release Readiness | `todo` | regression sweep, QA, cut list |

## Task Register

| ID | Workstream | Task | Owner | Status | Depends On | Notes |
|---|---|---|---|---|---|---|
| A1 | WS-A | Define canonical session model | Unassigned | `todo` | - | Make `guest` and `authenticated` the only primary modes |
| A2 | WS-A | Remove or isolate actor-style auth complexity | Unassigned | `todo` | A1 | Keep external behavior stable |
| A3 | WS-A | Document session states and transitions | Unassigned | `todo` | A1 | Short ADR-style note is enough |
| B1 | WS-B | Define repository factory/provider | Unassigned | `todo` | A1 | Must align with session model |
| B2 | WS-B | Enforce guest-local and auth-cloud rules | Unassigned | `todo` | B1 | Add tests as part of implementation |
| B3 | WS-B | Reduce implicit repository selection paths | Unassigned | `todo` | B1 | Remove ad hoc routing where possible |
| C1 | WS-C | Define shared domain module boundaries | Unassigned | `todo` | A1, B1 | Keep scope narrow |
| C2 | WS-C | Move shared types/contracts/builders | Unassigned | `todo` | C1 | Prioritize notes, folders, journal |
| C3 | WS-C | Centralize neutral validators/helpers | Unassigned | `todo` | C1 | Avoid UI sharing |
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
| H1 | WS-H | Build quality checklist | Unassigned | `todo` | - | Commands plus manual checks |
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
- `bun test`
- `bun run test:smoke`
- `bun --filter @skriuw/mobile typecheck`

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
