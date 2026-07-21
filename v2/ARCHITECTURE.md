# Architecture

## Context

Skriuw Standalone starts as one local desktop application. Post-start interaction must feel immediate. A later web runtime must preserve that behavior without turning the desktop application into a web client.

Initial loading may perform expensive preparation. Navigation after loading may not depend on disk, IPC, network, route loading, Markdown parsing, or Git.

## System shape

```text
Application shell
├── normalized workspace store
├── persistent editor host
├── command registry
└── WorkspacePort
    ├── desktop adapter
    │   └── native SQLite and background Git
    ├── browser adapter
    │   └── worker-owned SQLite WASM and OPFS
    └── memory adapter
        └── tests and fixtures
```

Only the backend foundation exists today. Application shell and adapters beyond native SQLite come later.

`skriuw-fixtures` generates deterministic operation-sequence workspaces for scale and adapter testing. It depends only on the domain contracts, never on storage adapters, and no generated fixture data is committed. Its integration tests carry the deterministic import, bootstrap, and native Git history correctness harnesses plus ignored manual optimized-build measurements recorded in [docs/benchmarks/2026-07-21-backend-workloads.md](docs/benchmarks/2026-07-21-backend-workloads.md). See [docs/fixtures.md](docs/fixtures.md).

Backend access is owned by one serialized runtime queue. Callers submit work and receive a completion handle. The desktop bridge must wait for completions away from the renderer and UI threads. FIFO execution makes write ordering explicit and prevents SQLite lock contention inside the process.

Every runtime clone shares one lifecycle state. Shutdown atomically stops submissions, drains accepted FIFO work, resolves pending completions, and joins the worker. Dropping the final handle performs the same join. Shell teardown and database replacement must call shutdown away from latency-sensitive threads.

Consecutive queued save-only requests may share one storage call without sharing acknowledgements. The runtime never waits to form a batch, caps each batch at 64 requests, and treats every other request as a FIFO barrier. SQLite commits each bounded batch in one outer transaction with one savepoint per original request, so conflicts remain isolated and every successful revision keeps its own FTS update and history-outbox row.

Typed subsystem errors project to bounded diagnostics only at shell or persistence boundaries. Diagnostics carry stable context and category enums plus a normalized 1,024-byte message ceiling. Public projections redact adapter detail; the local history retry queue may persist bounded materializer detail and never includes it in bootstrap or portable archives.

## Runtime contract

Startup calls `bootstrap()` once. Returned snapshot contains nodes, document JSON, settings, active note, and cached history headers. Renderer normalizes this data and prepares editor states before dismissing startup UI.

Every user action first updates renderer state synchronously. Durable work is submitted as a `WorkspaceOperation`. Acknowledgments carry resulting revisions. Navigation never waits for acknowledgments.

```text
User action
├── synchronous local state update
├── same-frame paint
└── queued operation
    ├── one bounded SQLite transaction
    ├── one request savepoint and acknowledgement
    ├── search projection update
    ├── durable history outbox append
    └── revision acknowledgment
```

## Boundaries

### Domain

`skriuw-domain` owns transport-safe records and versioned operations. It performs no database, filesystem, framework, or operating-system work.

### Storage port

`skriuw-storage` defines required backend behavior. Interfaces describe use cases, not generic table CRUD. Its ordered operation-group capability defaults to sequential execution so adapters remain correct without implementing transaction coalescing.

### Storage runtime

`skriuw-runtime` owns the backend worker and FIFO request queue. It never owns product rules or SQL. It serializes bootstrap, operation batches, and search against a selected storage adapter, groups only already-queued consecutive save requests, and returns waitable completion handles for shell adapters.

### Native lifecycle

`skriuw-lifecycle` coordinates runtime shutdown with native database replacement. It verifies a create-new candidate before revoking the current runtime, drains and joins every clone, requires closed WAL state, moves the original to an explicit rollback sibling, moves the candidate into the canonical path, and resumes only after integrity and bootstrap succeed. Post-move failure restores and reopens the original when possible.

### SQLite adapter

`skriuw-sqlite` owns schema migration, transactions, optimistic revision checks, FTS projections, and the durable history outbox.

### History

History is a separate capability. `skriuw-history` coordinates leased queue items through backend-neutral materializer, reader, and cache ports. Desktop uses the native-only `skriuw-history-git` adapter to materialize Markdown into a hidden Git repository. Its separate read-only reader checks only `refs/heads/history`: reachable commits must form one linear chain with unique valid identities, complete metadata, and readable UTF-8 note blobs. Cache rebuild validates and enumerates all headers before one transactional SQLite replacement; version Markdown loads only when opened. Web may retain structured revisions locally or use remote history. SQLite remains authoritative. History failures cannot prevent saves. Persisted leases make retries crash-safe. Materializers must be idempotent by outbox item ID. Integrity and rebuild run only when explicitly requested, never during startup or interaction paths.

### Future web runtime

Web uses the same operation protocol and renderer store. A dedicated worker owns SQLite WASM over OPFS. Network sync, if added, consumes a durable outbox and never services note navigation.

### Recovery and portability

`WorkspaceArchive` is the versioned interchange contract for export, import, and cross-runtime migration. It contains canonical workspace state only. Each adapter rebuilds search, history caches, and operational queues locally. Immutable golden JSON fixtures catalogue every supported archive version and must keep passing domain validation plus two complete SQLite import/export round trips. Native raw-database backup is a separate SQLite capability and never becomes the web interchange format.

Native backup uses SQLite's Online Backup API against a live WAL database. It publishes only a create-new, single-file artifact after integrity, foreign-key, migration, and domain validation. Scheduled rotation enforces a six-hour default cadence and publishes immutable relative-path recovery manifests before checksum-guarded pruning. Restore writes a new verified database rather than replacing the open workspace. See [docs/recovery.md](docs/recovery.md).

## Data ownership

- `workspace_nodes`: tree metadata.
- `documents`: canonical structured document plus Markdown projection.
- `documents_fts`: rebuildable search projection.
- `app_state`: durable workspace/UI state.
- `history_cache`: rebuildable history headers.
- `history_outbox`: durable pending history materialization.

See [docs/data-model.md](docs/data-model.md).

## Performance

Architecture performance is tested as a contract, not assumed from framework choice. See [docs/performance-contract.md](docs/performance-contract.md).

## Decisions

- [ADR-0001: standalone local-first product](docs/adr/0001-standalone-local-first.md)
- [ADR-0002: SQLite is canonical](docs/adr/0002-sqlite-canonical.md)
- [ADR-0003: operation protocol and runtime adapters](docs/adr/0003-operation-protocol.md)
- [ADR-0004: defer UI and editor selection](docs/adr/0004-defer-ui-editor.md)
- [ADR-0005: asynchronous Git history](docs/adr/0005-background-git-history.md)
- [ADR-0006: native Git history materializer](docs/adr/0006-native-git-materializer.md)
- [ADR-0007: portable workspace archive](docs/adr/0007-portable-workspace-archive.md)
- [ADR-0008: verified native SQLite backups](docs/adr/0008-verified-native-backups.md)
- [ADR-0009: subtree trash and permanent purge](docs/adr/0009-subtree-trash-and-purge.md)
- [ADR-0010: backend-owned node ranking](docs/adr/0010-backend-owned-node-ranking.md)
- [ADR-0011: graceful storage runtime shutdown](docs/adr/0011-graceful-runtime-shutdown.md)
- [ADR-0012: lossless save batching](docs/adr/0012-lossless-save-batching.md)
- [ADR-0013: versioned settings and note metadata](docs/adr/0013-versioned-settings-and-note-metadata.md)
- [ADR-0014: bounded failure diagnostics](docs/adr/0014-bounded-failure-diagnostics.md)
- [ADR-0015: scheduled backup rotation](docs/adr/0015-scheduled-backup-rotation.md)
- [ADR-0016: deterministic operation-sequence scale fixtures](docs/adr/0016-deterministic-scale-fixtures.md)
- [ADR-0017: verified live database swap](docs/adr/0017-verified-live-database-swap.md)
- [ADR-0018: read-only Git history integrity and cache rebuild](docs/adr/0018-read-only-git-history-integrity.md)
- [ADR-0019: archive compatibility fixtures](docs/adr/0019-archive-compatibility-fixtures.md)
