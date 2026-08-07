# ADR-0027: Browser SQLite uses a worker-owned OPFS SAH pool

- Status: accepted
- Date: 2026-08-04

## Context

The browser runtime needs the same canonical SQLite behavior as desktop while
keeping database, migration, and filesystem work off the renderer thread. It
must remain durable when offline and must never present an in-memory or
IndexedDB fallback as durable storage.

The adapter must fit the existing Rust crate boundary. Reimplementing workspace
operations and archive rules in JavaScript would create a second product model.
Using the official SQLite JavaScript worker API would also require duplicating
the native adapter's SQL orchestration outside Rust.

## Decision

The browser crate uses `sqlite-wasm-rs` 0.5 and `sqlite-wasm-vfs` 0.2. The VFS
is the OPFS synchronous-access-handle pool (`opfs-sahpool`) installed from a
dedicated worker. It is configured as SQLite's default VFS before one
`SqliteWorkspace` is opened. The worker owns exactly one database for its
lifetime and serializes every request.

This choice deliberately reuses `skriuw-sqlite` for domain validation,
operation application, ordered shared migrations, immutable migration
checksums, FTS, transactions/savepoints, settings/app state, and portable
archive import/export. The browser crate adds only the OPFS installation,
worker lifecycle, typed wire protocol, boundary limits, and recovery error
projection. No SQLite handle, OPFS handle, or Rust object crosses the worker
boundary.

The SAH-pool VFS provides durable OPFS storage and full SQLite durability
without requiring cross-origin isolation headers. It allows one active VFS
instance for the configured origin directory, matching the one-owner worker
contract. A second tab cannot silently open an ephemeral substitute; it gets an
explicit open failure. Multi-tab coordination is deferred until it has a
concrete product requirement.

The browser uses SQLite's rollback-journal behavior as configured by the
selected VFS and adapter. Native filesystem backup/restore and Git history are
not exposed. A validated `WorkspaceArchive` is the browser recovery and
cross-runtime portability boundary; operational queues, FTS rows, OPFS files,
and native Git data remain excluded.

## Failure contract

Initialization distinguishes unsupported worker/OPFS, denied storage, quota,
database-too-new, migration, corruption, and open failures where the underlying
interfaces expose enough information. Requests distinguish invalid input,
protocol mismatch, conflict, not-found, shutdown, timeout, worker crash, quota,
corruption, and bounded backend failures. Public messages never include SQLite
details, OPFS paths, or source errors.

`skriuw-storage::StorageError::Backend` currently erases SQLite result codes.
The browser boundary therefore recognizes the bounded SQLite text for quota and
corruption only to select a stable public code, while still redacting that text.
The preferred follow-up is a shared typed storage failure category emitted by
`skriuw-sqlite`; this ADR does not authorize that shared-crate change.

## Consequences

- Browser and native storage execute the same canonical adapter behavior.
- OPFS and SQLite work run only in a dedicated worker and navigation continues
  to use the hydrated renderer store.
- Safari 16.x is not supported by this adapter; Safari 17+, Firefox 111+, and
  Chromium 108+ are the documented baseline, subject to secure-context and
  site-storage policy.
- Private/guest modes may deny or evict persistence and therefore fail
  explicitly rather than falling back.
- The build pins the matching `wasm-bindgen` CLI, emits the ignored WASM module
  before application checks/builds, and routes the existing browser bridge to
  the dedicated storage worker. A real Chromium gate proves OPFS durability
  across worker close and page reload; a WebDriver BiDi harness proves the same
  durability on system Firefox, and 1,000/5,000-note storage-runtime
  measurements are recorded in
  `docs/benchmarks/2026-08-05-browser-runtime-scale.md`. Safari evidence and
  production-build renderer-interaction measurements remain release
  requirements.

## Primary references

- [SQLite WASM persistent storage](https://sqlite.org/wasm/doc/trunk/persistence.md)
- [`sqlite-wasm-rs` crate documentation](https://docs.rs/sqlite-wasm-rs/0.5.5/sqlite_wasm_rs/)
- [`FileSystemFileHandle.createSyncAccessHandle`](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)
