# Parallel implementation brief: tags, people, and note mentions

## Outcome

Ship one local-first relationship system for three typed references in a note:

- `#tag` references a workspace tag.
- `@person` references a workspace person.
- `@note` references another workspace note.

Each committed reference stores a stable ID, never a title string. The editor may display the current name, but a rename must update every rendered reference, backlink, and suggestion without rewriting unrelated documents. Typed text remains ordinary text until a user accepts a suggestion.

This is post-v1 scope. Preserve all v1 performance contracts: no disk, IPC, parsing, Git, network, or lazy loading on note navigation; no React commits caused by editor typing; and no editor remount.

## Product rules

- A tag has a name and optional restrained color. It is workspace-local and can be renamed or deleted.
- A person has a display name, optional initials/avatar color, and optional local note. It is not an authenticated user or network identity.
- The `@` suggestion menu groups People and Notes, ranks exact/prefix matches before other matches, is keyboard complete, and has empty, loading-free, disabled, and reduced-motion states.
- `#` starts tag completion. `@` starts people-and-notes completion. A committed token renders as an inline atom/mark with a stable target ID and accessible text.
- Backlinks show notes that mention the open note. Person and tag detail views show their referencing notes. All three use hydrated, in-memory projections.
- Trashed or purged notes cannot be selected as a mention target. Existing mentions to a trashed note render a clear unavailable state; purging does not silently retarget them.
- Rename changes display resolution atomically and immediately. Delete requires an explicit policy: default to preserving the token as unresolved text with its old label, then remove it from completion and index projections.
- Import/export preserves tags, people, and structured reference IDs. Rebuildable indexes and caches are regenerated locally.

## Architecture and performance contract

1. Extend the portable domain archive, versioned operations, generated contracts, SQLite migration ledger, and storage use-case traits. Do not add table-shaped CRUD APIs.
2. Make tags and people canonical entities. Make document-reference and reverse-reference data rebuildable projections derived from canonical structured document JSON; update them transactionally with the document save.
3. Bootstrap tags, people, and the per-note incoming-reference projection with the existing snapshot, normalize them in the external renderer store, and keep selectors narrow.
4. Maintain query indexes in memory after bootstrap. Suggestion filtering must not cross the bridge and must not scan or parse every document on each keypress. Use stable arrays/maps and a bounded result list.
5. The ProseMirror plugin owns transient query state. It may update its own view/menu, but ordinary typing must not notify the workspace store or render the shell, sidebar, metadata panel, or offscreen rows.
6. Navigation and backlinks read only hydrated state. A durable edit follows the existing optimistic-update then serialized-operation acknowledgement path.
7. Rebuild indexes only during explicit maintenance, import, or recovery—not startup interaction or navigation. Index failures must be visible and recoverable, never hidden.
8. Establish and measure fixtures with 5,000 notes, 1,000 tags, 1,000 people, and a high-reference document. Add a named budget before implementation: suggestion open/filter P95 below 8 ms, maximum below 16.67 ms; 100 cached note switches with zero dropped frames, bridge calls, editor remounts, or typing React commits.

## Parallel ownership

Create isolated worktrees and do not edit another agent's files. The integrator alone owns `TODO.md`, `docs/handoff.md`, lockfiles, generated contracts, and final conflict resolution.

### Opus — domain, storage, and correctness

Own Rust crates, migrations, contracts, archive fixtures, and backend tests. Implement typed IDs and operations for tags/people; structured reference validation; canonical entities; rebuildable outgoing/incoming reference projections; transactionality; trash/purge behavior; import/export; and explicit index rebuild/integrity paths. Return a small, dependency-ordered commit series plus raw benchmark evidence. Do not edit renderer files or shared continuity documents.

Required regressions: stable-ID rename resolution, rejected dangling references, cross-kind target validation, archive round trips, failed-save rollback, inherited-trash exclusion, purge behavior, reference-index rebuild, and a 5,000-note workload.

### Fable — editor, store, and product interaction

Own `app/` renderer code and focused renderer tests. Add the ProseMirror reference representation, `#`/`@` suggestion controller, keyboard and accessibility semantics, narrow selectors, backlinks/detail panels, and optimistic acknowledgement reconciliation against the declared bridge contract. Use direct module imports, `type` rather than `interface`, component-local `Props`, and no comments. Do not edit Rust, contracts, migrations, or continuity documents.

Required regressions: one persistent editor view; accepted and cancelled suggestions; selection/delete/undo/redo; rename updates display without document rewrite; unresolved target rendering; narrow render allowlists; zero bridge calls on navigation; zero React commits while typing; keyboard and screen-reader behavior.

### Integrator — contract, measurement, and release gate

First review both branches for contract alignment. Resolve the minimal bridge shape, generate contracts, add the performance fixture and production workflow scenarios, run `./scripts/generate.sh`, `./scripts/check.sh`, `git diff --check`, and the measured production runner. Update ADRs if a durable ownership decision changes. Commit verified slices in dependency order and publish only after the complete suite passes.

## Definition of done

- Every reference remains resolvable by stable ID across rename, move, archive export/import, restore, and restart.
- Canonical writes and reference projections are atomic; errors do not leave partial backlinks.
- Backlinks and detail lists are instant from the hydrated store.
- Tags/people/note mention completion is local, keyboard-accessible, and bounded.
- All current v1 performance invariants remain proven on the existing Linux reference workflow.
- Documentation states the unresolved-reference and delete policy plainly.
