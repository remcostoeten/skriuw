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

Backend access is owned by one serialized runtime queue. Callers submit work and receive a completion handle. The desktop bridge must wait for completions away from the renderer and UI threads. FIFO execution makes write ordering explicit and prevents SQLite lock contention inside the process.

Every runtime clone shares one lifecycle state. Shutdown atomically stops submissions, drains accepted FIFO work, resolves pending completions, and joins the worker. Dropping the final handle performs the same join. Shell teardown and database replacement must call shutdown away from latency-sensitive threads.

## Runtime contract

Startup calls `bootstrap()` once. Returned snapshot contains nodes, document JSON, settings, active note, and cached history headers. Renderer normalizes this data and prepares editor states before dismissing startup UI.

Every user action first updates renderer state synchronously. Durable work is submitted as a `WorkspaceOperation`. Acknowledgments carry resulting revisions. Navigation never waits for acknowledgments.

```text
User action
├── synchronous local state update
├── same-frame paint
└── queued operation
    ├── one SQLite transaction
    ├── search projection update
    ├── durable history outbox append
    └── revision acknowledgment
```

## Boundaries

### Domain

`skriuw-domain` owns transport-safe records and versioned operations. It performs no database, filesystem, framework, or operating-system work.

### Storage port

`skriuw-storage` defines required backend behavior. Interfaces describe use cases, not generic table CRUD.

### Storage runtime

`skriuw-runtime` owns the backend worker and FIFO request queue. It never owns product rules or SQL. It serializes bootstrap, operation batches, and search against a selected storage adapter and returns waitable completion handles for shell adapters.

### SQLite adapter

`skriuw-sqlite` owns schema migration, transactions, optimistic revision checks, FTS projections, and the durable history outbox.

### History

History is a separate capability. `skriuw-history` coordinates leased queue items through backend-neutral materializer, reader, and cache ports. Desktop uses the native-only `skriuw-history-git` adapter to materialize Markdown into a hidden Git repository. Header walks rebuild the transactional SQLite cache; version Markdown loads only when opened. Web may retain structured revisions locally or use remote history. SQLite remains authoritative. History failures cannot prevent saves. Persisted leases make retries crash-safe. Materializers must be idempotent by outbox item ID.

### Future web runtime

Web uses the same operation protocol and renderer store. A dedicated worker owns SQLite WASM over OPFS. Network sync, if added, consumes a durable outbox and never services note navigation.

### Recovery and portability

`WorkspaceArchive` is the versioned interchange contract for export, import, and cross-runtime migration. It contains canonical workspace state only. Each adapter rebuilds search, history caches, and operational queues locally. Native raw-database backup is a separate SQLite capability and never becomes the web interchange format.

Native backup uses SQLite's Online Backup API against a live WAL database. It publishes only a create-new, single-file artifact after integrity, foreign-key, migration, and domain validation. Restore writes a new verified database rather than replacing the open workspace.

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
