# Session handoff

Last reviewed: 2026-07-21

## Start here

Git integrity and archive compatibility fixtures are complete on the primary branch.

```bash
cd /home/remcostoeten/dev/skriuw-standalone
git status --short
git branch --show-current
git log --oneline --decorate -15
./scripts/check.sh
```

Read, in order:

1. `AGENTS.md`
2. `TODO.md`
3. `ARCHITECTURE.md`
4. `docs/performance-contract.md`
5. Relevant ADRs under `docs/adr`

## Repository state

- Active branch: `feat/instant-local-first-foundation`.
- Remote: none configured.
- Last implementation commits: `6a65abb feat: verify Git history integrity` and `a3f87e2 test: add archive compatibility fixtures`.
- Expected worktree state: clean.
- Current verification result: 110 tests plus formatting, Clippy, generated-schema drift checks, and `git diff --check` pass; two manual backend benchmarks and one manual fixture materialization are ignored by the default suite.
- CLI smoke: healthy empty integrity returned `ok: 0 commit(s), 0 note(s)` without changing repository file hashes; empty rebuild returned `cached 0 history header(s)`; corrupt history exited 1 with `integrity.backend: Git history integrity check found 4 issue(s)` and no path leakage.
- Archive integration status: Claude implementation `33cf41d` was reviewed and cherry-picked as `a3f87e2`. Its stale shared-doc commit `24dddb3` was not cherry-picked.
- Archive CLI smoke imported the representative fixture, passed source integrity, exported it, imported that export into a second database, and passed second integrity; both imports reported 7 nodes and 4 documents.
- Rust toolchain: 1.95.0.
- Ignored local development database: `.data/skriuw.db`.

Run commands again. Do not trust these numbers after new commits.

## Product objective

Build a standalone desktop notes application first. After startup, navigation and frequent interactions must stay inside one frame and never await database, IPC, network, Git, Markdown parsing, or lazy loading. Preserve the existing dense navigation, nested sidebar, shortcuts, context menus, structured Markdown editor, slash menu, metadata/history sidebar, command palette, and settings. Exclude journal, people, and tags from MVP.

A later offline-capable web runtime must reuse domain operations, archives, renderer-store behavior, and fixtures. Desktop performance may not depend on a server. Web portability may not pull native compromises into hot paths.

## Architecture already implemented

```text
skriuw-domain
├── transport records
├── workspace operations
├── versioned portable settings
├── archive contract
└── pure validation

skriuw-storage
├── workspace port
├── maintenance port
├── history queue/cache ports
├── bounded diagnostic contract
└── recovery result types

skriuw-sqlite
├── native canonical storage
├── migrations and checksums
├── FTS projection
├── atomic import
├── verified backup/restore
├── scheduled recovery manifests/retention
├── transactional subtree trash/purge
└── backend-owned rank allocation/compaction

skriuw-runtime
├── serialized FIFO storage worker
├── bounded lossless save batching
└── clone-safe shutdown and worker join

skriuw-lifecycle
└── verified live-database swap and rollback orchestration

skriuw-history
├── leased retry worker
├── reader/materializer ports
└── cache rebuild orchestration

skriuw-history-git
├── native-only Git materializer
└── read-only integrity reader

skriuw-fixtures
└── portable deterministic operation-sequence workloads
```

The UI contract remains a fully hydrated in-memory workspace. Navigation is renderer-only. Persistence acknowledgements reconcile revisions later.

## Important implementation facts

- SQLite is canonical; Git is asynchronous Markdown history only.
- `WorkspaceArchive` is canonical interchange; raw SQLite backup is native recovery only.
- Import validates everything before mutation and replaces canonical state in one transaction.
- CLI import creates a verified safety backup first.
- Raw restore writes a new path and never swaps the live database.
- History Markdown loads only when a version is opened.
- Git integrity checks only the exact existing repository and `refs/heads/history`; missing, non-repository, bare, worktree-less, corrupt, nonlinear, ambiguous, or unreadable history fails without repository mutation.
- History-cache rebuild validates and enumerates complete Git history before replacing SQLite headers in one transaction.
- Direct deletion markers make their complete subtree unavailable without rewriting descendant timestamps.
- `WorkspaceSnapshot::unavailable_node_ids()` derives the active-tree projection from the hydrated parent graph.
- Search, active-note state, commands, history headers, and history claims enforce inherited unavailability.
- Trash keeps FTS and history state for instant restore; retention-guarded purge removes the complete subtree and every projection atomically.
- Create, move, and restore operations request first, last, before, or after placement instead of supplying raw ranks.
- SQLite uses immediate-neighbor midpoint allocation and compacts only the active destination sibling set when necessary.
- Operation acknowledgements coalesce final parent/rank changes by node ID for optimistic renderer reconciliation.
- Runtime shutdown rejects new work, drains accepted requests, resolves completions, and joins the worker exactly once across all clones.
- Dropping the final runtime handle joins the worker; abnormal termination is reported as `RuntimeError::WorkerFailure`.
- The runtime groups at most 64 already-queued consecutive save-only requests without waiting; every non-save or mixed request remains a FIFO barrier.
- SQLite commits each grouped save burst in one outer transaction with one savepoint and one result per original request.
- Settings are one typed version-1 document with explicit defaults and lossless unknown-field extensions; unsupported future versions fail validation.
- The reduced metadata sidebar derives from canonical node, document, and history fields. People, tags, properties, covers, secrets, and editor-specific metadata remain excluded.
- Diagnostics use stable context/category enums and normalized messages capped at 1,024 UTF-8 bytes. Public mappings redact adapter details.
- Local history retry diagnostics are bounded before SQLite persistence, cleared on the next claim, and excluded from snapshots and archives.
- Scheduled native recovery defaults to a six-hour cadence, 28 artifacts, and a 30-day age ceiling. The capability enforces cadence without owning a timer.
- Immutable recovery manifests contain relative paths only and publish before checksum-guarded pruning; manual and pre-import backups remain outside rotation.
- Live replacement verifies the candidate before shutdown, drains every runtime clone, retains the old canonical file as an explicit rollback sibling, and resumes only after replacement integrity and bootstrap pass.
- Failed post-move replacement restores and reopens the original when possible; unrecoverable rollback reports exact stage/status and preserves remaining files.
- Deterministic fixture generators create wide, nested, and mixed 1,000-note and 5,000-note operation sequences with pinned digests, declared FTS counts, and no committed generated data.
- Generated schemas live in `generated/contracts`.
- Golden archive fixtures live in `fixtures/archives`; the manifest must match every production-supported archive version.
- No frontend framework, desktop shell, editor, router, React, React Scan, or package manager has been added.
- No remote exists; do not claim work is pushed.
- No WASM target is installed; do not claim web compilation has passed.

## Completed trash slice

- ADR-0009 defines inherited trash, explicit restore destinations, retention cutoff ownership, and irreversible purge scope.
- Portable operations are `TrashSubtree`, `RestoreSubtree`, and `PurgeSubtree`; generated JSON Schema is current.
- Trashing clears an active note anywhere below the selected root.
- Restoring an ancestor preserves descendants that were independently trashed.
- Missing, purged, and still-trashed restore destinations fail; passing `None` is the explicit workspace-root fallback.
- Purge deletes nodes, documents, FTS, history cache, and history outbox rows in one transaction.
- Nested tree, search, command, active-note, history, restore, retention, purge, and rollback regressions pass.

## Completed rank slice

- ADR-0010 defines semantic placement, 1024-point gaps, deterministic `(rank, id)` ordering, destination-only compaction, and acknowledgement behavior.
- Portable create, move, and restore operations no longer expose durable raw ranks.
- Root, nested, move-to-folder, anchor validation, repeated insertion, compaction, deterministic tie, coalescing, and rollback regressions pass.
- Five optimized-build samples for 5,000 root-note placements had a 1.805-second median after neighbor-only allocation replaced full sibling scans.
- Raw samples and environment metadata are in `docs/benchmarks/2026-07-20-rank-allocation.md`.

## Completed runtime shutdown slice

- Parallel implementation commit `c1654a8` was reviewed and integrated as `60a2337`; stale parallel handoff commit `d046277` was not cherry-picked.
- ADR-0011 defines submission revocation, FIFO draining, completion resolution, join ownership, final-drop behavior, and failure replay.
- All runtime clones share one sender and worker state. Concurrent and repeated shutdown calls join at most once and replay the stored outcome.
- Six deterministic regressions cover draining, post-shutdown rejection, clone state, concurrent shutdown, final drop, and worker panic without new sleep-based coordination.

## Completed save-batching slice

- ADR-0012 defines no-wait save grouping, the 64-request cap, FIFO barriers, request-level savepoints, commit-before-completion, and lossless history semantics.
- The storage port supplies correct sequential group behavior by default; SQLite optimizes grouped requests under one outer transaction.
- Conflicting or otherwise failed requests roll back only to their own savepoint. Successful neighbors retain independent revision acknowledgements, FTS replacements, and history-outbox rows.
- Deterministic runtime regressions cover queued batching, non-save barriers, the cap, completion order, and shutdown draining. SQLite regressions cover revision conflicts, history preservation, and group rollback isolation.
- Five optimized file-backed samples for 1,000 saves capped at 64 requests per transaction had a 79.965-millisecond grouped median versus 107.098 milliseconds sequential, a 25.3% reduction.
- Raw samples and environment metadata are in `docs/benchmarks/2026-07-20-save-batching.md`.

## Completed settings and metadata slice

- Parallel implementation commit `64cea3f` was reviewed and integrated as `5d0fff5`; stale parallel handoff commit `7a7563d` was not cherry-picked.
- ADR-0013 defines the complete version-1 settings defaults, whole-document update operation, compatibility policy, extension preservation, state ownership, and reduced metadata surface.
- Migration 0002 folds pre-release `setting:` rows into the versioned settings document. Generated operation, snapshot, and archive schemas are current.
- Domain and SQLite regressions cover defaults, partial documents, extension round trips, unsupported versions, migration, persistence, transactional rollback, export, and import.

## Completed bounded-diagnostics slice

- ADR-0014 defines stable runtime, storage, history, backup, recovery, and integrity contexts plus unavailable, invalid-input, not-found, conflict, already-exists, backend, and internal categories.
- Diagnostic messages normalize whitespace and control characters, preserve UTF-8 boundaries, and cap message data at 1,024 bytes.
- Typed errors remain internal control flow. Public projections redact backend text, entity IDs, filesystem paths, Git details, and SQLite details.
- The history queue accepts a bounded diagnostic value instead of an arbitrary error string; SQLite persists its deterministic local display only in operational outbox state.
- Runtime, storage, history, SQLite persistence, and category-boundary regressions pass. Rebuilt CLI smoke failures produced `backup.already_exists`, `recovery.backend`, and `recovery.invalid_input` without source-path leakage.

## Completed backup-rotation slice

- ADR-0015 defines default cadence, count and age retention, immutable manifest generations, publication order, pending-deletion recovery, and strict artifact ownership.
- Every scheduled artifact is normalized and verified before its manifest generation records relative filename, creation time, size, SHA-256, schema version, complete migration fingerprint, and verification state.
- Retention deletes only manifest-listed regular files whose size and checksum still match. Missing pending files are idempotent; changed files, directories, symlinks, unrelated files, manual backups, and pre-import backups are never pruned.
- One workspace gate serializes concurrent attempts. Eight deterministic regressions cover publication metadata, cadence skips, count and age retention, changed-file refusal, invalid policy/manifest handling, concurrent calls, and preservation of two valid manifest generations around corrupt older files.
- CLI commands `backup-rotate` and `backup-manifest` expose the native boundary. The full smoke created and listed a backup, skipped an early second call, restored to a new database, and passed integrity.
- Recovery procedures, live replacement, rollback retention, and CLI smoke are documented in `docs/recovery.md`.

## Completed live-database-swap slice

- ADR-0017 defines preflight, runtime shutdown, closed-WAL verification, same-directory moves, directory synchronization, replacement verification, rollback, reopen, and failure reporting.
- The native `skriuw-lifecycle` crate owns orchestration without introducing a runtime/SQLite dependency cycle. Candidate validation happens while the old runtime is usable; accepted saves drain into the retained rollback artifact before SQLite closes.
- Success returns a newly bootstrapped runtime and snapshot while every old clone remains unavailable. Post-move failure restores and reopens the original when possible; unrecoverable rollback reports the failed stage/status and preserves remaining files.
- Seven deterministic tests cover clone draining, accepted-save durability, invalid candidate and existing rollback preflight, replacement-move failure, post-move verification failure, and rollback failure. The `swap-database` CLI smoke replaced a seeded database and passed integrity for both canonical and rollback files.

## Completed scale-fixture slice

- Parallel implementation commit `3c85506` was reviewed and integrated as `3346343`; stale parallel handoff commit `584b1fb` was not cherry-picked.
- ADR-0016 defines fixtures as portable generated operation sequences with semantic placement, fixed values, and pinned SHA-256 digests rather than committed JSON or database artifacts.
- `skriuw-fixtures` generates wide, nested, and mixed workspaces at 1,000 and 5,000 notes. Metadata declares node, folder, document, operation, depth, and FTS match expectations.
- Six generator regressions cover determinism, pinned digests, validation, tree shape, search tokens, timestamps, and settings. One default SQLite test materializes a smaller fixture; the ignored manual 5,000-note run remains outside CI timing gates.

## Completed Git-integrity slice

- ADR-0018 defines the exact-repository read-only boundary, owned history ref, linear-history invariant, required metadata and content rules, cache replacement order, and failure behavior.
- `GitHistoryReader` never initializes or repairs repositories. An existing repository without `refs/heads/history` is healthy empty history.
- Inspection visits every reachable commit deterministically, rejects merges or broken ancestry, validates all four trailers, rejects duplicate outbox and note-revision identities, and requires each commit's note path to be a UTF-8 blob.
- Typed reports expose commit/note counts and typed issues. Public diagnostics redact paths, Git object IDs, libgit2 text, and backend internals.
- `history-integrity` and `history-rebuild-cache` expose explicit maintenance boundaries. Rebuild completes Git validation before opening SQLite and publishes only through transactional `replace_history_headers`.
- Seven new deterministic regressions cover healthy empty and multi-note history, non-mutating repository rejection, merges, metadata and identity corruption, note-object corruption, empty/successful rebuild, corrupt-Git cache preservation, and diagnostic redaction. Existing SQLite rollback coverage proves failed cache replacement restores the old cache.

## Completed archive-compatibility slice

- Claude implementation `33cf41d` was reviewed in its isolated worktree and integrated as `a3f87e2`; stale handoff commit `24dddb3` was excluded.
- ADR-0019 defines immutable versioned golden fixtures, exact manifest coverage, supported-version policy, canonical ordering, and the migration-plus-fixture requirement for future versions.
- Version 1 includes minimal and representative fixtures covering nesting, inherited trash, active note, non-default settings, unknown extensions, Unicode Markdown/document JSON, and deterministic timestamps and ranks.
- Five domain regressions enforce catalogue coverage, supported-version agreement, validation, semantic round trips, sensitive fields, and explicit future-version rejection.
- Three SQLite regressions prove import/bootstrap/export across two complete round trips, search and inherited unavailability, integrity, and failure-before-mutation preservation.

## Known correctness gap and next task

Next backend slice: add deterministic import, bootstrap, and history workload measurements over existing scale fixtures, recording raw samples and environment metadata without adding timing gates to shared CI. Durable sidebar expansion persistence remains a later UI-linked operation. UI/editor selection remains blocked on the performance spikes in `docs/performance-contract.md`.

## Verification model

Backend correctness:

```bash
./scripts/check.sh
```

Recovery smoke uses an isolated temporary directory:

```bash
recovery_dir="$(mktemp -d)"
cli="target/debug/skriuw-cli"
cargo build -p skriuw-cli --locked
"$cli" init "$recovery_dir/source.db"
"$cli" seed "$recovery_dir/source.db"
"$cli" export "$recovery_dir/source.db" "$recovery_dir/workspace.json"
"$cli" backup "$recovery_dir/source.db" "$recovery_dir/backup.db"
"$cli" restore "$recovery_dir/backup.db" "$recovery_dir/restored.db"
"$cli" integrity "$recovery_dir/restored.db"
```

Performance is not yet proven because no renderer exists. React Scan alone is never proof. Final proof requires production traces, fixed fixtures, render-count assertions, long-frame measurements, memory data, and zero dropped frames during 100 cached note switches on reference hardware.

## Working rules

- Preserve branch history and user changes.
- Use `apply_patch` for edits.
- No code comments; explanation belongs in docs and ADRs.
- TypeScript uses `type`, never `interface`.
- Local component props type is `Props`.
- Prefer named function declarations and functional composition.
- Keep native filesystem, Git, SQLite, and shell code outside portable crates.
- Do not scaffold UI before benchmark gates are complete.
- Commit completed slices separately after verification.
- Update this handoff whenever branch state, test count, current limitation, or next task changes.
