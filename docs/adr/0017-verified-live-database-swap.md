# ADR-0017: Verified live database swap

- Status: accepted
- Date: 2026-07-21

## Context

Verified restore intentionally creates a new database path. Replacing the canonical desktop database requires coordination with the serialized runtime: accepted work must become durable, every runtime clone must stop submitting, SQLite must close and release WAL state, filesystem moves must remain recoverable, and the replacement must bootstrap before the application resumes. Letting a CLI or future Tauri command improvise this order risks lost writes, stale sidecars, an empty canonical path, or an unusable process after rollback.

## Decision

A native `skriuw-lifecycle` crate owns the database-swap orchestration and depends on the generic runtime plus the native SQLite adapter. Neither portable domain/storage code nor SQLite depends on the runtime.

Preflight runs while the current runtime remains usable. Canonical, candidate, and rollback paths must be distinct regular files or create-new targets in one resolved directory. The rollback path must not exist. The candidate is opened read-only and must pass SQLite integrity, foreign-key, migration-ledger, domain, and bootstrap validation. Candidate WAL and shared-memory sidecars are rejected.

After preflight:

1. Shared runtime shutdown rejects new submissions, drains accepted FIFO work, resolves completions, joins the worker, and closes SQLite for every clone.
2. The canonical database must have no remaining WAL or shared-memory sidecar and must pass read-only verification again.
3. The canonical file is renamed to the explicit create-new rollback path.
4. The candidate is renamed into the canonical path.
5. Directory metadata is synchronized on Unix after each rename boundary.
6. The replacement is verified read-only, opened normally, checked for integrity, bootstrapped, and only then placed behind a new runtime.

Successful replacement returns the new runtime, hydrated snapshot, and retained rollback path. Every clone of the old runtime remains permanently unavailable. The rollback artifact is not deleted automatically.

Any failure after the original move attempts to return the replacement to its candidate path, move the rollback file back to the canonical path, verify and reopen the original database, bootstrap it, and return a `RolledBack` outcome containing a usable new runtime plus the original failure stage. Exact replacement sidecars created during a failed reopen are removed only when they are regular files and before the replacement returns to its original candidate path.

If filesystem rollback or reopening the restored original fails, the operation returns `DatabaseSwapError` with explicit stage and rollback status. It does not claim success or delete remaining database files. Preflight failures occur before shutdown and leave the existing runtime usable.

The CLI exposes `swap-database <canonical> <candidate> <rollback>` as a native smoke and recovery boundary. A future desktop shell must call the same lifecycle API away from renderer and interaction threads. UI confirmation, restart presentation, rollback deletion policy, and platform-specific user messaging remain shell concerns.

## Consequences

- Accepted saves cannot be omitted from the rollback artifact.
- No database is overwritten in place and no broad directory operation occurs.
- Same-directory renames preserve the strongest filesystem replacement semantics available without a platform framework.
- A failed replacement can return a usable restored runtime rather than forcing an application restart when rollback succeeds.
- Catastrophic rollback failure is explicit and preserves remaining paths for manual recovery.
- The lifecycle crate is native-only; future browser storage implements an equivalent adapter-specific state transition.
