---
title: "Architecture"
description: "The Rust domain layer, SQLite as canonical storage, the operation pipeline, and the boundaries that keep navigation off the disk."
---

## Context

Skriuw Standalone starts as one local desktop application. Post-start interaction must feel immediate. The web runtime must preserve that behavior without turning the desktop application into a web client.

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
    ├── mobile adapter
    │   └── UniFFI facade over native SQLite, behind an Expo module
    └── memory adapter
        └── tests and fixtures
```

The store, operation queue, tree model and route model live once, in
`shared/renderer-core`, and are consumed by the desktop/browser renderer in
`apps/workspace/` and by the mobile client in `apps/mobile/`. Icons follow the same pattern:
`packages/icons` holds generated Fluent glyph data and the animation spec, and
each platform only draws it ([ADR-0049](/v2/adr/0049-shared-icon-system)).

The backend foundation, React product shell, and direct ProseMirror editor exist today. The isolated UI architecture harness remains measurement evidence rather than a runtime adapter.

`skriuw-fixtures` generates deterministic operation-sequence workspaces for scale and adapter testing. It depends only on the domain contracts, never on storage adapters, and no generated fixture data is committed. See [Scale fixtures](/v2/fixtures).

Backend access is owned by one serialized runtime queue. Callers submit work and receive a completion handle. The desktop bridge must wait for completions away from the renderer and UI threads. FIFO execution makes write ordering explicit and prevents SQLite lock contention inside the process.

Every runtime clone shares one lifecycle state. Shutdown atomically stops submissions, drains accepted FIFO work, resolves pending completions, and joins the worker. Dropping the final handle performs the same join. Shell teardown and database replacement must call shutdown away from latency-sensitive threads.

Consecutive queued save-only requests may share one storage call without sharing acknowledgements. The runtime never waits to form a batch, caps each batch at 64 requests, and treats every other request as a FIFO barrier. SQLite commits each bounded batch in one outer transaction with one savepoint per original request, so conflicts remain isolated and every successful revision keeps its own FTS update and history-outbox row.

Typed subsystem errors project to bounded diagnostics only at shell or persistence boundaries. Diagnostics carry stable context and category enums plus a normalized 1,024-byte message ceiling. Public projections redact adapter detail; the local history retry queue may persist bounded materializer detail and never includes it in bootstrap or portable archives.

The product uses one persistent direct ProseMirror view. Documents through 192 top-level blocks use the whole-document path; larger documents keep one canonical structured document behind a 192-block rendered window. Canonical range reconciliation, compact grouped undo/redo, full-document find/replace and clipboard output, deferred IME movement, accessible traversal, selection/focus/scroll restoration, and external reconciliation remain renderer-local. Product measurements keep 2,000-block editor installation and typing inside their budgets.

Embedded flowcharts are versioned atomic ProseMirror nodes stored inside the canonical document. Mermaid-compatible source is a portable projection, not a second source of truth. A direct semantic-DOM/SVG NodeView owns interaction locally and commits one document transaction per completed gesture; diagram editing adds no navigation IPC, database read, React store subscription, or library-specific persisted state. See [ADR-0025](/v2/adr/0025-embedded-diagrams).

The product sidebar ports the measured dependency-free fixed-row tree into one viewport-bounded row pool. Rendered DOM stays independent of 1,000-node and 5,000-node workspace size; deterministic sibling order, collapsed-subtree exclusion, imperative focus reveal, active-descendant semantics, and exact ARIA level/set metadata survive row recycling. Visual indentation clamps by sidebar width while semantic depth remains unlimited. Expansion IDs persist through a serialized native-only SQLite use case, are excluded from portable archives, and update after synchronous local paint through a coalesced background acknowledgement.

The `apps/workspace/harnesses/ui-architecture` and `apps/workspace/harnesses/renderer-store` harnesses are the isolated measurement code behind that selection ([ADR-0020](/v2/adr/0020-ui-architecture), accepted): direct editor state switching, and a normalized dependency-free external store with narrow React selectors where the application shell and persistent editor host hold no workspace subscription, editor typing remains editor-owned, and equivalent updates stop before selector traversal. Both harnesses are retained as regression suites — `./bin/build` and CI still run them — and stay separate from production and profiling artifacts.

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

### Sync coordination

`skriuw-sync` owns the optional background sync lifecycle: a narrow push/pull transport seam over the generated v1 sync contracts, classified failure handling with bounded jittered backoff, and one coalesced coordinator loop per workspace database that claims, pushes, acknowledges, pulls, and applies through the durable `WorkspaceSyncQueue` port. It holds no SQLite transaction across network work and never runs on interaction or recovery paths; see `specs/desktop-sync-coordinator.md`.

Convergence is automatic and deterministic: every device that consumes the same ordered log reaches the same canonical state without user action. Document writes converge by server sequence with a pending local write winning until it is sequenced, every other family is last-writer-by-server-sequence, an operation that cannot apply becomes a superseded received record, and a losing document body is preserved as a history revision with provenance `superseded`. There is no conflict state, table, or surface. Remote changes reach the open editor through per-cycle change sets and an in-place merge. See [ADR-0037](/v2/adr/0037-automatic-sync-convergence) and `specs/sync-convergence-v1.md`.

### AI completion

`skriuw-domain` owns the provider-neutral completion request, streaming event,
cancellation, terminal, and error contracts. `skriuw-ai` supplies the permanent
deterministic fake adapter used to prove the public seam without network access
or credentials. The desktop shell creates the completion service on the first
explicit request, runs it on a dedicated worker, streams through a Tauri channel,
and keeps active cancellation handles outside the workspace runtime. Renderer
consumers reject foreign, out-of-order, and post-disposal events. Provider
initialization and completion work are opt-in and explicit-action only; they
never enter startup, typing, save, navigation, or the serialized workspace
storage runtime. See
[ADR-0033](/v2/adr/0033-ai-provider-completion-seam).

`skriuw-ai-ollama` is the native local-provider adapter. It implements the
domain-owned `LocalAiRuntime` capability and the same `AiComplete` seam while
owning loopback HTTP, official-release verification, archive extraction, and
managed child-process lifecycle. The shell constructs inert state at setup but
does not probe, install, start, or contact Ollama until the opt-in-gated AI
settings surface opens or an explicit AI action runs. Existing system services
remain externally owned; shutdown stops only a child Skriuw started. See the
[Ollama runtime contract](/v2/specs/ollama-runtime).

Editor AI actions are the only completion feature that writes near canonical
documents. They stream into a preview buffer, never the document, accept as one
editor transaction, and apply extraction results through the ordinary task and
reference operations after explicit confirmation. See the
[AI editor actions contract](/v2/specs/ai-editor-actions).

### History

History is a separate capability. `skriuw-history` coordinates leased queue items through backend-neutral materializer, reader, and cache ports. Desktop uses the native-only `skriuw-history-git` adapter to materialize Markdown into a hidden Git repository. Its separate read-only reader checks only `refs/heads/history`: reachable commits must form one linear chain with unique valid identities, complete metadata, and readable UTF-8 note blobs. Cache rebuild validates and enumerates all headers before one transactional SQLite replacement; version Markdown loads only when opened. Web may retain structured revisions locally or use remote history. SQLite remains authoritative. History failures cannot prevent saves. Persisted leases make retries crash-safe. Failed materialization receives durable exponential backoff capped at six hours, so one poison revision cannot starve later eligible history work. Materializers must be idempotent by outbox item ID. Integrity and rebuild run only when explicitly requested, never during startup or interaction paths.

The desktop history drain publishes one note-scoped header only after materialization and the matching SQLite cache commit succeed. Renderer startup subscribes before bootstrap and merges the event through a narrow store update with version-ID deduplication. Git or cache failure publishes nothing, and neither saves nor navigation wait for publication.

### Web runtime

The browser runs the same core, operation protocol, and renderer store. A
dedicated worker owns SQLite WASM over an OPFS SAH pool
([ADR-0027](/v2/adr/0027-browser-sqlite-opfs-sah-pool)), and the same sync
coordinator logic runs inside that storage worker
([ADR-0028](/v2/adr/0028-browser-worker-owned-sync)). Network sync consumes
a durable outbox and never services note navigation.

Optional connected mode replicates versioned domain operations rather than
SQLite files or pages. Local-only remains the default. The cloud adapter
assigns an ordered workspace log inside one SQLite-backed Durable Object per
workspace; large content is referenced through content-addressed chunks
instead of being forced into cloud SQLite rows. Sync requests require an
authenticated session and per-workspace authorization. See
[the cloud sync master tracker](/v2/specs/cloud-sync-master) and
[ADR-0026](/v2/adr/0026-optional-cloud-operation-replication).

### Mobile runtime

The iOS and Android client is the third implementation of the same bridge
seam, not a second protocol. `crates/skriuw-mobile` is a UniFFI facade
exposing narrow use cases over `skriuw-runtime`; it depends on domain,
runtime, storage, sqlite, sync and crypto only, and `skriuw-domain` gained no
dependency for it. An Expo native module (`apps/mobile/modules/skriuw-core`) wraps
the generated bindings — `jniLibs` on Android, an xcframework built on a macOS
runner for iOS — and `apps/mobile/src/bridge` adapts that module to the
`BridgePort` the shared store already speaks. SQLite stays canonical and
native; durable writes stay serialized and transactional inside Rust. Git
history, local AI, import adapters, scheduled backups, tabs and split view are
excluded from the mobile build and refused with the same actionable error as
`requireDesktopRuntime`.

Chrome is native and the editor is not. Navigation, toolbar, tab bar, sheets,
lists and settings are React Native views over `shared/renderer-core`; theme
tokens are generated from `themes.css` and drift-checked. The editor is the
desktop ProseMirror surface, unforked, mounted once in a persistent Expo DOM
component that swaps documents by versioned message and is never remounted on
navigation. The performance contract applies unchanged: the snapshot is
hydrated into the store at startup and navigation waits on neither the native
module nor the webview. See
[ADR-0048](/v2/adr/0048-native-mobile-shell-over-shared-core) and the
[mobile app contract](/v2/specs/mobile-app).

### Recovery and portability

`WorkspaceArchive` is the versioned interchange contract for export, import, and cross-runtime migration. It contains canonical workspace state only. Each adapter rebuilds search, history caches, and operational queues locally. Immutable golden JSON fixtures catalogue every supported archive version and must keep passing domain validation plus two complete SQLite import/export round trips. Native raw-database backup is a separate SQLite capability and never becomes the web interchange format.

Native backup uses SQLite's Online Backup API against a live WAL database. It publishes only a create-new, single-file artifact after integrity, foreign-key, migration, and domain validation. Scheduled rotation enforces a six-hour default cadence and publishes immutable relative-path recovery manifests before checksum-guarded pruning. Restore writes a new verified database rather than replacing the open workspace. See [Native recovery runbook](/v2/recovery).

## Data ownership

- `workspace_nodes`: tree metadata.
- `documents`: canonical structured document plus Markdown projection.
- `documents_fts`: rebuildable search projection.
- `app_state`: durable workspace/UI state.
- `history_cache`: rebuildable history headers.
- `history_outbox`: durable pending history materialization.
- `sync_connection`: optional connected-workspace/device identity and cursors.
- `sync_outbox`: durable pending replicated local operations.
- `sync_blocked_operations`: recovery-visible operations awaiting later sync capabilities or a retry.
- `sync_received_operations`, `sync_document_heads`, `sync_tombstones`, `sync_dangling_references`: inbound provenance, document heads, terminal tombstones, and deferred references.

See [Data model](/v2/data-model).

## Performance

Architecture performance is tested as a contract, not assumed from framework choice. See [Performance contract](/v2/performance-contract).

The C3 production gate drives the real renderer, external store, shell, and
editor through deterministic native bridge fixtures, then independently
profiles the 1,000/5,000-note and 50/500/2,000-block contexts. The named Linux
reference run proves 300 cached switches with zero dropped frames, no
navigation bridge or resource work, no editor remount, zero typing React
commits, and all timing budgets. Raw workflow and performance samples are
committed with the release evidence; native durability remains enforced by the
Rust and Tauri suites rather than simulated browser state.

The mobile client has no equivalent gate yet. Its shared layer is measured at
both fixture sizes — navigation makes no bridge call and a keystroke wakes no
shell subscriber — but the reference-device run the contract asks for has not
happened, so R-P4 is unverified rather than met. See
[the mobile readiness evidence](/v2/benchmarks/2026-09-20-mobile-release-readiness).

## Decisions

- [ADR-0001: standalone local-first product](/v2/adr/0001-standalone-local-first)
- [ADR-0002: SQLite is canonical](/v2/adr/0002-sqlite-canonical)
- [ADR-0003: operation protocol and runtime adapters](/v2/adr/0003-operation-protocol)
- [ADR-0004: defer UI and editor selection](/v2/adr/0004-defer-ui-editor)
- [ADR-0005: asynchronous Git history](/v2/adr/0005-background-git-history)
- [ADR-0006: native Git history materializer](/v2/adr/0006-native-git-materializer)
- [ADR-0007: portable workspace archive](/v2/adr/0007-portable-workspace-archive)
- [ADR-0008: verified native SQLite backups](/v2/adr/0008-verified-native-backups)
- [ADR-0009: subtree trash and permanent purge](/v2/adr/0009-subtree-trash-and-purge)
- [ADR-0010: backend-owned node ranking](/v2/adr/0010-backend-owned-node-ranking)
- [ADR-0011: graceful storage runtime shutdown](/v2/adr/0011-graceful-runtime-shutdown)
- [ADR-0012: lossless save batching](/v2/adr/0012-lossless-save-batching)
- [ADR-0013: versioned settings and note metadata](/v2/adr/0013-versioned-settings-and-note-metadata)
- [ADR-0014: bounded failure diagnostics](/v2/adr/0014-bounded-failure-diagnostics)
- [ADR-0015: scheduled backup rotation](/v2/adr/0015-scheduled-backup-rotation)
- [ADR-0016: deterministic operation-sequence scale fixtures](/v2/adr/0016-deterministic-scale-fixtures)
- [ADR-0017: verified live database swap](/v2/adr/0017-verified-live-database-swap)
- [ADR-0018: read-only Git history integrity and cache rebuild](/v2/adr/0018-read-only-git-history-integrity)
- [ADR-0019: archive compatibility fixtures](/v2/adr/0019-archive-compatibility-fixtures)
- [ADR-0020: UI architecture selection](/v2/adr/0020-ui-architecture)
- [ADR-0021: tabs and split view](/v2/adr/0021-tabs-and-split-view)
- [ADR-0022: import into the Skriuw monorepo as the v2 line](/v2/adr/0022-v2-monorepo-import)
- [ADR-0023: lossless and reference-safe Markdown transfer](/v2/adr/0023-lossless-markdown-transfer)
- [ADR-0024: previewed and atomic provider import](/v2/adr/0024-previewed-atomic-provider-import)
- [ADR-0025: embedded diagrams use a structured local model](/v2/adr/0025-embedded-diagrams)
- [ADR-0026: optional cloud operation replication](/v2/adr/0026-optional-cloud-operation-replication)
- [ADR-0027: worker-owned browser SQLite over an OPFS SAH pool](/v2/adr/0027-browser-sqlite-opfs-sah-pool)
- [ADR-0028: browser sync inside the storage worker](/v2/adr/0028-browser-worker-owned-sync)
- [ADR-0029: stored video media](/v2/adr/0029-stored-video-media)
- [ADR-0030: remote cover download](/v2/adr/0030-remote-cover-download)
- [ADR-0031: explicit task promotion](/v2/adr/0031-explicit-task-promotion)
- [ADR-0032: task-shaped typing is explicit intent](/v2/adr/0032-task-shaped-typing-is-explicit)
- [ADR-0033: provider-agnostic AI completion seam](/v2/adr/0033-ai-provider-completion-seam)
- [ADR-0034: annotation anchors are document data](/v2/adr/0034-annotation-anchors-are-document-data)
- [ADR-0035: note annotation layer](/v2/adr/0035-note-annotation-layer)
- [ADR-0036: AI results are reviewed in place](/v2/adr/0036-ai-results-are-reviewed-in-place)
- [ADR-0037: automatic sync convergence](/v2/adr/0037-automatic-sync-convergence)
- [ADR-0038: personal template and search preferences](/v2/adr/0038-personal-template-and-search-preferences)
- [ADR-0039: provider-agnostic voice transcription seam](/v2/adr/0039-voice-transcription-seam)
- [ADR-0040: an AI run is visible work, steered from the note](/v2/adr/0040-ai-runs-are-visible-work)
- [ADR-0041: cover gradients are named, not styled](/v2/adr/0041-cover-gradients-are-named-not-styled)
- [ADR-0042: modal Vim editing](/v2/adr/0042-modal-vim-editing)
- [ADR-0043: end-to-end encrypted sync](/v2/adr/0043-end-to-end-encrypted-sync)
- [ADR-0044: locked notes](/v2/adr/0044-locked-notes)
- [ADR-0045: rendered Mermaid fences](/v2/adr/0045-rendered-mermaid-fences)
- [ADR-0046: per-account local workspaces](/v2/adr/0046-per-account-local-workspaces)
- [ADR-0047: the compact shell owns the back gesture and the install offer](/v2/adr/0047-compact-shell-owns-back-and-install)
- [ADR-0048: a native mobile shell over the shared Rust core](/v2/adr/0048-native-mobile-shell-over-shared-core)
- [ADR-0049: one shared icon system](/v2/adr/0049-shared-icon-system)

Personal templates reuse ordinary source notes; saved searches and template membership use bounded workspace preferences. See [ADR-0038](/v2/adr/0038-personal-template-and-search-preferences). Modal Vim editing is one `vimMode` setting driving CodeMirror's Vim extension in the raw Markdown view and a document-model Vim plugin in the rendered editor; see [ADR-0042](/v2/adr/0042-modal-vim-editing). Sync refresh retries and candidate-filtered full-text search follow the [refresh and search contract](/v2/specs/refresh-and-filtered-search).
