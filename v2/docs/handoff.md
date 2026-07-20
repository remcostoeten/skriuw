# Session handoff

Last reviewed: 2026-07-20

## Start here

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
- Last implementation commit before this handoff: `bc2329c feat: rotate verified recovery backups`.
- Expected worktree state: clean.
- Current verification result: 81 tests plus formatting, Clippy, and generated-schema drift checks pass; two manual backend benchmarks are ignored by the default suite and pass when selected.
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

skriuw-history
├── leased retry worker
├── reader/materializer ports
└── cache rebuild orchestration

skriuw-history-git
└── native-only Git implementation
```

The UI contract remains a fully hydrated in-memory workspace. Navigation is renderer-only. Persistence acknowledgements reconcile revisions later.

## Important implementation facts

- SQLite is canonical; Git is asynchronous Markdown history only.
- `WorkspaceArchive` is canonical interchange; raw SQLite backup is native recovery only.
- Import validates everything before mutation and replaces canonical state in one transaction.
- CLI import creates a verified safety backup first.
- Raw restore writes a new path and never swaps the live database.
- History Markdown loads only when a version is opened.
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
- Generated schemas live in `generated/contracts`.
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
- Recovery procedures and the still-missing live swap lifecycle are documented in `docs/recovery.md`.

## Known correctness gap

A verified backup can be restored only to a new path. No lifecycle orchestrator yet revokes submissions, joins the runtime, closes the live SQLite connection, swaps a verified candidate into the canonical path, reopens and bootstraps it, or rolls the filesystem state back if reopen fails. The CLI and future shell must not improvise this destructive boundary.

Immediate next slice:

1. Reserve ADR-0017 because ADR-0016 belongs to the optional concurrent scale-fixture slice; define shutdown, close, swap, reopen, bootstrap, rollback, and failure-reporting order.
2. Require a verified create-new restore candidate and explicit canonical/rollback paths; never overwrite an open connection or delete a broad directory.
3. Move the existing canonical database to a uniquely named rollback sibling, move the candidate into place, reopen and run integrity/bootstrap checks, then retain or remove the rollback only according to the contract.
4. On any post-move failure, restore the original canonical file and report whether rollback itself succeeded. Add deterministic failure injection without sleeps.
5. Keep Tauri/UI presentation out until shell selection; expose a native orchestration boundary and CLI smoke, update persistent docs, and commit before Git integrity work.

Parallel work reservation: deterministic 1,000-note and 5,000-note scale fixtures may run in `/home/remcostoeten/dev/skriuw-claude-fixtures` on `feat/deterministic-scale-fixtures`, based on `21a000f`; ADR-0016 is reserved for that slice if needed. Do not overlap its new fixture crate, workspace membership, or fixture documentation when integrating later.

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
