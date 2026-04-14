# Current Codebase Refactor Plan

## Purpose

This document defines the refactor required in the current codebase before we make any Expo-specific design decisions.

The goal is to simplify the app to the product model we actually want:

- guest users can open the app immediately
- guest users get a seeded local-only workspace
- guest edits never touch the cloud database
- authenticated users get a private cloud workspace scoped to their own account
- authenticated users get starter content in their own account on first use
- notes, folders, and journal entries follow the same guest-vs-authenticated rule
- the architecture becomes portable enough that Expo can sit next to web later

This is not an implementation spec for Expo. It is a cleanup and refactor plan for the current web codebase.

## What Exists Today

### Current runtime shape

- Auth state is managed in [src/platform/auth/index.ts](/home/remco/dev/haptic-ui-clone/src/platform/auth/index.ts).
- App startup is coordinated in [src/shared/components/persistence-bootstrap.tsx](/home/remco/dev/haptic-ui-clone/src/shared/components/persistence-bootstrap.tsx).
- The global provider tree mounts `AppAuthGate` and `PersistenceBootstrap` in [src/providers/app-providers.tsx](/home/remco/dev/haptic-ui-clone/src/providers/app-providers.tsx).
- Notes and journal stores use actor-switching and stale-session guards in:
  - [src/features/notes/store.ts](/home/remco/dev/haptic-ui-clone/src/features/notes/store.ts)
  - [src/features/journal/store.ts](/home/remco/dev/haptic-ui-clone/src/features/journal/store.ts)
- Preferences, document layout state, and sidebar state also maintain actor-scoped state in:
  - [src/features/settings/store.ts](/home/remco/dev/haptic-ui-clone/src/features/settings/store.ts)
  - [src/features/layout/store.ts](/home/remco/dev/haptic-ui-clone/src/features/layout/store.ts)
  - [src/features/notes/components/sidebar/store.ts](/home/remco/dev/haptic-ui-clone/src/features/notes/components/sidebar/store.ts)
- Data access currently branches at repository level between local and remote in:
  - [src/core/persistence/repositories/notes-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/notes-repository.ts)
  - [src/core/persistence/repositories/folders-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/folders-repository.ts)
  - [src/core/persistence/repositories/journal-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/journal-repository.ts)
- Guest seed content is created in [src/core/persistence/repositories/privacy-demo.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/privacy-demo.ts).
- Local persistence is abstracted through:
  - [src/core/persistence/repositories/local-records.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/local-records.ts)
  - [src/core/persistence/repositories/local-backend.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/local-backend.ts)
- Remote persistence is implemented via Supabase row mappers in:
  - [src/core/persistence/supabase/client.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/supabase/client.ts)
  - [src/core/persistence/supabase/records.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/supabase/records.ts)

### Problems in the current shape

1. The product model is simple, but runtime state management is organized around `actorId` transitions.
2. Feature stores know too much about auth and workspace switching.
3. App startup is coordinated by a dedicated bootstrap component instead of one clear session-to-repository selection path.
4. Repository selection is implicit and scattered. It depends on live auth state instead of an explicit workspace mode.
5. Guest seeding exists, but authenticated first-user seeding is not clearly modeled as a first-class flow.
6. The codebase still carries design gravity from a more ambitious sync architecture than the current product needs.
7. Several modules are web-specific in ways that will make a later web-plus-Expo split harder than necessary.

## Refactor Outcome

After this refactor, the codebase should behave like this:

### Product behavior

- Guest users open the app without any gate.
- Guest users see seeded demo notes and journal content.
- Guest writes go to local storage only.
- Authenticated users sign in with email/password, Google, or GitHub.
- Authenticated users read and write only their own cloud-scoped records.
- Authenticated users receive starter notes/folders/journal content if their account is empty.
- Authenticated users get a basic account/profile surface with metrics and account controls.

### Architecture behavior

- App state depends on an explicit session mode, not an implicit actor-switching pattern.
- Feature stores do not own auth routing rules.
- Data access is selected through clear repository providers or factory functions.
- Core read/write use cases can later be reused by another app shell.
- Any Next-specific wrappers remain thin and sit at the edge.

## Non-Goals

The following are explicitly out of scope for this refactor:

- Expo implementation
- Tauri implementation
- local/cloud sync queue
- offline reconciliation
- conflict resolution
- automatic filesystem sync
- a custom backend rewrite
- full monorepo migration

## Target Conceptual Model

Use these terms consistently in the refactor.

### Session modes

- `guest`
- `authenticated`

### Workspace providers

- `local`
- `cloud`

### Rules

- `guest` always maps to `local`
- `authenticated` always maps to `cloud`
- guest seed data is local-only
- authenticated starter data is cloud-only and user-scoped

Do not keep `privacy`, `account-local`, `actor`, and `canSync` as parallel concepts if they represent the same product decision in different names.

## Storage Decisions Locked In

These decisions are no longer open questions for the current refactor.

- Remove `PGlite` from the web app.
- Store guest workspace content in IndexedDB.
- Use `localStorage` only for small preferences, flags, and similar lightweight values.
- Keep authenticated content in the cloud-backed Postgres path.
- Do not build or preserve a dual local backend abstraction for guest storage.

## Workstreams

The work can be executed by multiple agents in parallel if ownership stays disjoint.

### Workstream A: Session Model Simplification

**Owner**

- auth/session layer only

**Primary files**

- [src/platform/auth/index.ts](/home/remco/dev/haptic-ui-clone/src/platform/auth/index.ts)
- [src/platform/auth/use-auth.ts](/home/remco/dev/haptic-ui-clone/src/platform/auth/use-auth.ts)
- [src/features/auth/components/app-auth-gate.tsx](/home/remco/dev/haptic-ui-clone/src/features/auth/components/app-auth-gate.tsx)
- [src/features/auth/components/auth-entry-point.tsx](/home/remco/dev/haptic-ui-clone/src/features/auth/components/auth-entry-point.tsx)

**Goals**

- Replace the current auth vocabulary with a simpler session vocabulary.
- Normalize state around `guest` vs `authenticated`.
- Keep support for email/password, Google, and GitHub.
- Preserve remember-me behavior if it is still desired.
- Ensure unauthenticated users can view the app directly without being routed through a blocking auth gate.

**Deliverables**

- A simplified `AuthSnapshot` or replacement session snapshot type.
- Removal or reduction of `actorId` and mode transitions from auth state.
- A clear UI entry point for sign-in and sign-out.

**Constraints**

- Do not rewrite data repositories in this workstream.
- Do not change feature-store internals except where required for type compatibility.

### Workstream B: Repository Selection And Persistence Boundary

**Owner**

- persistence and repository layer only

**Primary files**

- [src/core/persistence/repositories/notes-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/notes-repository.ts)
- [src/core/persistence/repositories/folders-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/folders-repository.ts)
- [src/core/persistence/repositories/journal-repository.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/journal-repository.ts)
- [src/core/persistence/repositories/index.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/index.ts)
- [src/core/persistence/repositories/local-records.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/local-records.ts)
- [src/core/persistence/supabase/records.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/supabase/records.ts)
- [src/core/persistence/supabase/client.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/supabase/client.ts)

**Goals**

- Make repository selection explicit instead of inferred ad hoc from live auth state.
- Introduce one clear composition point for `local` vs `cloud`.
- Keep local and cloud implementations separable.
- Avoid coupling core operations to Next-specific runtime assumptions.
- Collapse guest local persistence to IndexedDB-only.

**Deliverables**

- A repository factory or provider pattern based on current session/workspace mode.
- Local repository implementations that remain guest-safe.
- Cloud repository implementations that remain authenticated and user-scoped.
- Removal of the `PGlite` implementation and related fallback logic.

**Constraints**

- Do not build sync queues.
- Do not introduce extra abstraction layers unless they pay for themselves immediately.
- Preserve current Supabase row scoping and soft-delete behavior where already correct.

### Workstream C: Guest Seed And Authenticated Starter Content

**Owner**

- seed and onboarding persistence only

**Primary files**

- [src/core/persistence/repositories/privacy-demo.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/repositories/privacy-demo.ts)
- any new starter-seed modules created for authenticated users
- relevant repository files for starter inserts

**Goals**

- Keep guest seed content as local-only demo content.
- Add first-authenticated-session starter content in the user's own cloud space.
- Ensure starter content is inserted once for an empty account, not on every login.

**Deliverables**

- Shared seed builders where useful.
- Distinct guest and authenticated seeding flows.
- Clear tests proving seed behavior for both modes.

**Constraints**

- Do not mix guest seed markers with authenticated starter-state markers.
- Do not seed authenticated content in browser local storage.

### Workstream D: Bootstrap Removal And Store Hydration Simplification

**Owner**

- app bootstrapping and state orchestration only

**Primary files**

- [src/shared/components/persistence-bootstrap.tsx](/home/remco/dev/haptic-ui-clone/src/shared/components/persistence-bootstrap.tsx)
- [src/providers/app-providers.tsx](/home/remco/dev/haptic-ui-clone/src/providers/app-providers.tsx)
- [src/features/notes/store.ts](/home/remco/dev/haptic-ui-clone/src/features/notes/store.ts)
- [src/features/journal/store.ts](/home/remco/dev/haptic-ui-clone/src/features/journal/store.ts)
- [src/features/settings/store.ts](/home/remco/dev/haptic-ui-clone/src/features/settings/store.ts)
- [src/features/layout/store.ts](/home/remco/dev/haptic-ui-clone/src/features/layout/store.ts)
- [src/features/notes/components/sidebar/store.ts](/home/remco/dev/haptic-ui-clone/src/features/notes/components/sidebar/store.ts)

**Goals**

- Remove or heavily reduce `beginActorTransition`, `syncActor`, and stale-session machinery.
- Move initialization to a simpler session-aware hydration path.
- Keep feature stores focused on feature state, not auth orchestration.

**Deliverables**

- A smaller startup path with fewer coordinated effects.
- Feature stores that hydrate against the currently selected repository set.
- Reduced dependence on a top-level bootstrap component.

**Constraints**

- Do not reintroduce implicit global mutation order.
- If a temporary bootstrap component remains, it must become thinner than the current version.

### Workstream E: Account/Profile Surface

**Owner**

- authenticated account UI only

**Primary files**

- [src/features/auth/components/auth-entry-point.tsx](/home/remco/dev/haptic-ui-clone/src/features/auth/components/auth-entry-point.tsx)
- new profile/account route or feature components
- supporting query functions and repository functions

**Goals**

- Add a basic authenticated account surface.
- Show at least minimal metrics and account controls.
- Provide a delete-account path if backend support already exists or can be added safely.

**Suggested feature scope**

- name
- email
- auth provider
- note count
- journal entry count
- sign out
- delete account

**Constraints**

- Keep this intentionally small.
- Do not expand into a full settings redesign in the same pass.

### Workstream F: Tests And Documentation Cleanup

**Owner**

- tests and docs only

**Primary files**

- [src/shared/components/__tests__/persistence-bootstrap.test.tsx](/home/remco/dev/haptic-ui-clone/src/shared/components/__tests__/persistence-bootstrap.test.tsx)
- [src/platform/auth/__tests__/index.test.ts](/home/remco/dev/haptic-ui-clone/src/platform/auth/__tests__/index.test.ts)
- [src/core/persistence/supabase/__tests__/records.test.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/supabase/__tests__/records.test.ts)
- [src/core/persistence/supabase/__tests__/sync.test.ts](/home/remco/dev/haptic-ui-clone/src/core/persistence/supabase/__tests__/sync.test.ts)
- any feature-store tests affected by removing actor logic
- [ARCHITECTURE.md](/home/remco/dev/haptic-ui-clone/ARCHITECTURE.md)
- docs that still imply a larger sync architecture than the one we are keeping

**Goals**

- Replace tests that encode actor-transition behavior with tests that encode guest/authenticated behavior.
- Update architecture docs so they match the simplified runtime.
- Mark outdated local-first sync plans as deferred if they remain in the repo.

**Constraints**

- Do not leave stale tests green by deleting coverage without replacing it.

## Suggested Execution Order

These workstreams can overlap, but this order minimizes merge pain.

### Phase 1

- Workstream A: Session Model Simplification
- Workstream B: Repository Selection And Persistence Boundary

These define the core contract that other workstreams need.

### Phase 2

- Workstream C: Guest Seed And Authenticated Starter Content
- Workstream D: Bootstrap Removal And Store Hydration Simplification

These implement the runtime flow on top of the new session and repository boundaries.

### Phase 3

- Workstream E: Account/Profile Surface
- Workstream F: Tests And Documentation Cleanup

These polish the feature set and lock the refactor in with tests and docs.

## Parallelization Rules For Multiple Agents

Use these rules if the plan is executed by multiple agents.

### Rule 1

Each agent owns a disjoint file set.

### Rule 2

No agent should change the same store file as another agent in parallel.

### Rule 3

Session type changes from Workstream A must be merged before finalizing Workstreams D and E.

### Rule 4

Repository factory or provider changes from Workstream B must be merged before finalizing Workstreams C and D.

### Rule 5

Documentation and tests should be updated last unless a workstream introduces new tests for its own changes.

## Proposed Agent Split

If using multiple agents, use this split.

### Agent 1

- Workstream A

### Agent 2

- Workstream B

### Agent 3

- Workstream C

### Agent 4

- Workstream D

### Agent 5

- Workstream E

### Agent 6

- Workstream F

If fewer agents are available:

- combine A + E
- combine B + C
- combine D + F

## Acceptance Criteria

The refactor is complete when all of the following are true.

1. Unauthenticated users can open and use the app without authentication blocking the main workspace.
2. Guest edits persist locally and never create cloud records.
3. Authenticated users only read and write records scoped to their own account.
4. New authenticated users receive starter content only once if their cloud workspace is empty.
5. Notes, folders, journal entries, and tag behavior all match the same guest-vs-authenticated rule.
6. Feature stores no longer depend on broad actor-switching mechanics to represent the simple product model.
7. The top-level app startup path is simpler than the current `PersistenceBootstrap` orchestration.
8. The account/profile surface exists for authenticated users.
9. Tests cover guest and authenticated flows.
10. Architecture docs describe the simplified model instead of a larger unfinished sync system.

## Risks To Watch

1. Accidentally preserving both the old actor model and the new session model at the same time.
2. Hiding repository-selection complexity behind too many wrappers.
3. Regressing guest-mode persistence while cleaning up auth.
4. Seeding authenticated starter data multiple times.
5. Overfitting the refactor to Next when the next step is likely web plus Expo.

## Definition Of Done For This Stage

This stage is done when the current codebase reflects the simplified guest-vs-authenticated product model and no longer depends on the overbuilt runtime flow that was designed for a more ambitious sync architecture.

Only after this stage is complete should we decide how to package the shared core for Expo next to the web app.
