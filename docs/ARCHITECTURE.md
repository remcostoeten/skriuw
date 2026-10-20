# Architecture

Skriuw is a Rust core with a React interface on top. The Rust core keeps your workspace in a SQLite database on your own device, and the interface keeps a full copy of it in memory. When you press a key, the interface updates its in-memory copy and paints the screen in the same frame. It then sends a small message describing the change to a queue in the Rust core, which writes it to SQLite in one transaction and updates the search index in that same transaction. Git history and sync run later, in the background. The screen never waits for any of this.

## Context

Skriuw Standalone started as one local desktop application. After startup, every interaction must feel immediate. The web runtime, the version that runs in a browser, must keep that behavior without turning the desktop application into a web client.

Startup may do expensive preparation. After startup, navigation may not depend on disk, IPC, network, route loading, Markdown parsing, or Git.

## Terms

These words come up throughout this page.

- **Renderer**: the React interface. It runs in a webview on desktop and in a tab in the browser.
- **Store**: the renderer's in-memory copy of the workspace. The interface reads from the store, never from disk.
- **IPC**: messages between the renderer and the native process behind it.
- **Operation**: a small, versioned message that describes one change, such as renaming a note. Its type is `WorkspaceOperation`.
- **Canonical**: the copy that counts. SQLite is canonical, and everything else is derived from it.
- **Projection**: data computed from canonical data, such as the search index. A projection can be deleted and rebuilt.
- **Transaction**: a group of database writes that either all happen or none do.
- **Outbox**: a table of work saved for later, such as revisions still to be written to Git or changes still to be sent to sync.
- **Port**: an interface that names what the app needs from a backend, in terms of use cases.
- **Adapter**: one implementation of a port, such as native SQLite on desktop or SQLite in a browser worker.
- **Seam**: a small interface where a different implementation can be plugged in, for example a fake one in tests.

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

The application shell is the frame of the app. It reaches storage only through `WorkspacePort`, and each platform plugs in its own adapter for that port.

The store, operation queue, tree model and route model are written once, in `shared/renderer-core`. The desktop and browser renderer in `apps/workspace/` and the mobile client in `apps/mobile/` both use them. Icons follow the same pattern: `packages/icons` holds generated Fluent glyph data and the animation spec, and each platform only draws it ([ADR-0049](adr/0049-shared-icon-system.md)).

The backend foundation, the React product shell and the direct ProseMirror editor exist today. The isolated UI architecture harness is kept as measurement evidence. It is not a runtime adapter.

`skriuw-fixtures` builds test workspaces by replaying sequences of operations, for scale and adapter testing. The output is deterministic: the same input always produces the same workspace. It depends only on the domain contracts, never on storage adapters, and no generated fixture data is committed. See [docs/fixtures.md](fixtures.md).

### The backend queue

All backend access goes through one serialized runtime queue. Requests run one at a time, first in, first out (FIFO). A caller submits work and gets back a completion handle it can wait on. The desktop bridge must wait on those handles away from the renderer and UI threads. Running requests in order makes write order explicit and prevents SQLite lock contention inside the process.

Every clone of the runtime shares one lifecycle state. Shutdown stops new submissions in one atomic step, then finishes the work it already accepted, resolves every pending completion, and joins the worker thread, which means it waits for that thread to exit. Dropping the last handle performs the same join. Shell teardown and database replacement must call shutdown away from threads where latency matters.

Save-only requests that are already queued next to each other may share one storage call. Each request still gets its own acknowledgement. The runtime never waits to form a batch, caps each batch at 64 requests, and treats any other kind of request as a barrier that ends the batch. SQLite commits each batch in one outer transaction with one savepoint per original request. A savepoint is a checkpoint inside a transaction that can be rolled back on its own. So a conflict in one request stays isolated, and every successful revision still gets its own full-text search (FTS) update and its own history outbox row.

### Errors and diagnostics

Each subsystem has typed errors. They are turned into bounded diagnostics only at the shell or persistence boundary. A diagnostic carries stable context and category enums, plus a normalized message of at most 1,024 bytes. Public diagnostics hide adapter detail. The local history retry queue may store bounded detail from the materializer, the component that writes history into Git. That detail never goes into bootstrap or into portable archives.

### Editor

The product uses one persistent direct ProseMirror view. It is created once and reused for every note. Documents with up to 192 top-level blocks are rendered whole. A larger document keeps one canonical structured document in memory and renders a 192-block window of it.

These stay inside the renderer, without calling the backend:

- canonical range reconciliation
- compact grouped undo and redo
- find and replace, and clipboard output, over the full document
- deferred IME movement (an IME is the input method used to type languages such as Chinese or Japanese)
- accessible traversal
- restoring selection, focus and scroll
- reconciling external changes

Product measurements keep installing and typing in a 2,000-block note inside their budgets.

Embedded flowcharts are versioned atomic ProseMirror nodes inside the canonical document. Atomic means the editor treats the whole diagram as one unit. Mermaid-compatible source is a portable projection, not a second source of truth. A direct semantic-DOM/SVG NodeView, custom code that draws and handles one node type, owns interaction locally and commits one document transaction per completed gesture. Diagram editing adds no navigation IPC, no database read, no React store subscription, and no library-specific persisted state. See [ADR-0025](adr/0025-embedded-diagrams.md).

### Sidebar tree

The product sidebar uses the measured, dependency-free fixed-row tree, ported into one row pool sized to the viewport. Only rows on screen exist in the DOM, so the DOM is the same size for a workspace with 1,000 nodes or 5,000 nodes. Rows are recycled as you scroll, and recycling keeps all of this intact: deterministic sibling order, hidden collapsed subtrees, imperative focus reveal, active-descendant semantics, and exact ARIA level and set metadata. Visual indentation is clamped by sidebar width, while semantic depth has no limit.

Expanded folder IDs are saved through a serialized, native-only SQLite use case and are left out of portable archives. They update after the local paint, through a coalesced background acknowledgement.

### Measurement harnesses

The `apps/workspace/harnesses/ui-architecture` and `apps/workspace/harnesses/renderer-store` harnesses are the isolated measurement code behind the UI architecture choice ([ADR-0020](adr/0020-ui-architecture.md), accepted). They measured two things:

- switching editor state directly, without remounting the editor
- a normalized, dependency-free external store read through narrow React selectors

In that store, the application shell and persistent editor host hold no workspace subscription, typing stays owned by the editor, and an update that changes nothing stops before any selector runs. Both harnesses are kept as regression suites. `./bin/build` and CI still run them, and they stay separate from production and profiling artifacts.

## Runtime contract

At startup the renderer calls `bootstrap()` once. It returns a snapshot with the nodes, document JSON, settings, the active note and cached history headers. The renderer normalizes this data, storing each record once by ID, and prepares editor states before it hides the startup screen. Loading the snapshot into the store like this is called hydration.

Every user action updates renderer state synchronously first. The durable work is then submitted as a `WorkspaceOperation`. Acknowledgements carry the resulting revisions. Navigation never waits for an acknowledgement.

One user action, in order:

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

Each section below names one crate or module and the one job it owns.

### Domain

`skriuw-domain` owns the records and versioned operations. They are transport-safe, which means they can be serialized and sent between processes. The crate does no database, filesystem, framework, or operating-system work.

### Storage port

`skriuw-storage` defines what a backend must be able to do. Its interfaces describe use cases, such as saving a document, not generic create, read, update and delete on tables. Its ordered operation-group capability runs groups one after another by default. That way an adapter is correct even if it does not implement transaction coalescing, which merges several groups into one transaction.

### Storage runtime

`skriuw-runtime` owns the backend worker and the FIFO request queue. It never owns product rules or SQL. It runs bootstrap, operation batches and search one at a time against the selected storage adapter. It groups only consecutive save requests that are already queued, and returns completion handles that shell adapters can wait on.

### Native lifecycle

`skriuw-lifecycle` coordinates runtime shutdown with replacing the native database file while the app runs ([ADR-0017](adr/0017-verified-live-database-swap.md)). It works in this order:

1. Verify a candidate database, created as a new file, before revoking the current runtime.
2. Drain and join every runtime clone.
3. Require SQLite's write-ahead log (WAL) to be closed.
4. Move the original database to an explicit rollback sibling.
5. Move the candidate into the canonical path.
6. Resume only after the integrity check and bootstrap succeed.

If a step fails after the move, it restores and reopens the original when possible.

### SQLite adapter

`skriuw-sqlite` owns schema migrations, transactions, optimistic revision checks, FTS projections, and the durable history outbox. An optimistic revision check means a write names the revision it expects to replace, and the write is refused if the stored revision is different.

### Sync coordination

`skriuw-sync` owns the optional background sync lifecycle. It consists of:

- a narrow push and pull transport seam over the generated v1 sync contracts
- classified failure handling with bounded, jittered backoff: each retry waits longer, up to a limit, with some randomness so devices do not retry in step
- one coalesced coordinator loop per workspace database, which claims local changes, pushes them, acknowledges them, pulls remote changes and applies them, all through the durable `WorkspaceSyncQueue` port

It never holds a SQLite transaction open during network work, and it never runs on interaction or recovery paths. See `specs/desktop-sync-coordinator.md`.

Convergence is automatic and deterministic: every device that reads the same ordered log reaches the same canonical state, without any user action. The rules:

- Document writes are ordered by server sequence. A local write that is still pending wins until the server gives it a sequence.
- Every other operation family is last writer wins, ordered by server sequence.
- An operation that cannot apply is kept as a superseded received record.
- A document body that loses is kept as a history revision with provenance `superseded`.

There is no conflict state, no conflict table, and no conflict screen. Remote changes reach the open editor through a change set per sync cycle and an in-place merge. See [ADR-0037](adr/0037-automatic-sync-convergence.md) and `specs/sync-convergence-v1.md`.

### AI completion

`skriuw-domain` owns the provider-neutral contracts for a completion request, a streaming event, cancellation, the terminal event that ends a run, and errors. Provider-neutral means they do not depend on any one AI provider. `skriuw-ai` supplies the permanent deterministic fake adapter, which proves the public seam works without network access or credentials.

The desktop shell creates the completion service on the first explicit request, runs it on a dedicated worker, and streams results through a Tauri channel. Active cancellation handles live outside the workspace runtime. Renderer code rejects events that are foreign, out of order, or that arrive after disposal. Provider setup and completion work happen only after you opt in and take an explicit action. They never enter startup, typing, saving, navigation, or the serialized workspace storage runtime. See [ADR-0033](adr/0033-ai-provider-completion-seam.md).

`skriuw-ai-ollama` is the native adapter for a local provider. It implements the domain-owned `LocalAiRuntime` capability and the same `AiComplete` seam. It owns loopback HTTP (requests to a server on this machine), verification of official releases, archive extraction, and the lifecycle of the child process it manages. At setup the shell creates only inert state. It does not probe, install, start, or contact Ollama until the opt-in-gated AI settings open or an explicit AI action runs. An Ollama service that was already installed stays owned by whoever installed it, and shutdown stops only a child process that Skriuw started. See the [Ollama runtime contract](specs/ollama-runtime.md).

Editor AI actions are the only completion feature that writes near canonical documents. They stream into a preview buffer, never into the document. Accepting applies the result as one editor transaction. Extraction results go through the ordinary task and reference operations, after you confirm them. See the [AI editor actions contract](specs/ai-editor-actions.md).

### History

History is a separate capability. `skriuw-history` hands out queue items under a lease, a claim with an expiry so that work held by a crashed worker can be picked up again. It works through three backend-neutral ports: a materializer, a reader, and a cache.

On desktop, the native-only `skriuw-history-git` adapter materializes Markdown into a hidden Git repository, which means it turns saved revisions into Markdown files committed there. A separate read-only reader checks only `refs/heads/history`. The commits reachable from it must form one linear chain, with unique valid identities, complete metadata, and note blobs that are readable UTF-8. A cache rebuild validates and lists every header before it replaces the SQLite cache in one transaction. The Markdown of a version is loaded only when you open it.

The web build may keep structured revisions locally or use remote history.

Rules that hold on every platform:

- SQLite stays authoritative.
- A history failure cannot prevent a save.
- Leases are persisted, so retries are safe after a crash.
- Failed materialization retries with durable exponential backoff capped at six hours, so one revision that keeps failing cannot block later history work.
- Materializers must be idempotent by outbox item ID: processing the same item twice has the same result as processing it once.
- Integrity checks and rebuilds run only when explicitly requested, never during startup or on interaction paths.

On desktop, the history drain, the background loop that works through the history outbox, publishes the new header for one note only after materialization and the matching SQLite cache commit both succeed. The renderer subscribes before bootstrap and merges the event through a narrow store update that skips version IDs it already has. If Git or the cache fails, nothing is published. Neither saving nor navigation waits for publication.

### Web runtime

The browser runs the same core, operation protocol, and renderer store. A dedicated worker owns SQLite compiled to WebAssembly (WASM). It stores the database in the Origin Private File System (OPFS), private file storage the browser gives each site, through a pool of synchronous access handles (the SAH pool) ([ADR-0027](adr/0027-browser-sqlite-opfs-sah-pool.md)). The same sync coordinator logic runs inside that storage worker ([ADR-0028](adr/0028-browser-worker-owned-sync.md)). Network sync reads from a durable outbox and never serves note navigation.

Optional connected mode replicates versioned domain operations, not SQLite files or pages. Local-only is the default. The cloud adapter orders each workspace's log inside one SQLite-backed Cloudflare Durable Object per workspace. Large content is stored as content-addressed chunks, named by a hash of their bytes, and referenced from the log instead of being forced into cloud SQLite rows. A sync request needs an authenticated session and authorization for that workspace. See [the cloud sync master tracker](specs/cloud-sync-master.md) and [ADR-0026](adr/0026-optional-cloud-operation-replication.md).

### Mobile runtime

The iOS and Android client is the third implementation of the same bridge seam, not a second protocol. `crates/skriuw-mobile` is a UniFFI facade. UniFFI generates Swift and Kotlin bindings for Rust code, and the facade uses it to expose narrow use cases over `skriuw-runtime`. It depends on domain, runtime, storage, sqlite, sync and crypto only, and `skriuw-domain` gained no dependency for it.

An Expo native module (`apps/mobile/modules/skriuw-core`) wraps the generated bindings: `jniLibs` on Android, and an xcframework built on a macOS runner for iOS. `apps/mobile/src/bridge` adapts that module to the `BridgePort` the shared store already speaks. SQLite stays canonical and native, and durable writes stay serialized and transactional inside Rust. Git history, local AI, import adapters, scheduled backups, and tabs and split view are left out of the mobile build. Asking for them returns the same actionable error as `requireDesktopRuntime`.

The chrome is native and the editor is not. Chrome means the frame around the content: navigation, toolbar, tab bar, sheets, lists and settings. These are React Native views over `shared/renderer-core`. Theme tokens are generated from `themes.css` and drift-checked. The editor is the desktop ProseMirror surface, unforked. It is mounted once in a persistent Expo DOM component, a webview managed by Expo, which swaps documents by versioned message and is never remounted on navigation. The performance contract applies unchanged: the snapshot is hydrated into the store at startup, and navigation waits on neither the native module nor the webview. See [ADR-0048](adr/0048-native-mobile-shell-over-shared-core.md) and the [mobile app contract](specs/mobile-app.md).

### Recovery and portability

`WorkspaceArchive` is the versioned format for export, import, and moving a workspace between runtimes. It holds canonical workspace state only. Each adapter rebuilds search, history caches, and operational queues itself. Immutable golden JSON fixtures, sample archives that never change, cover every supported archive version. Each one must keep passing domain validation and two complete SQLite import and export round trips. The native raw-database backup is a separate SQLite capability and never becomes the web interchange format.

Native backup uses SQLite's Online Backup API on a live WAL database. It publishes only a single-file artifact created as a new file, and only after integrity, foreign-key, migration, and domain validation pass. Scheduled rotation runs every six hours by default. It publishes immutable recovery manifests with relative paths before it prunes old backups, and pruning is guarded by checksums. Restore writes a new verified database instead of replacing the open workspace. See [docs/recovery.md](recovery.md).

### Workspace modules

The workspace renderer in `apps/workspace/src` is split into layers: app, shell, feature, commands, store, platform, shared, and contracts. Dependencies between layers go in one fixed direction. A module's root files are its public API, and its folders are private. `__tests__/apps/workspace/src/module-boundaries.test.ts` enforces layers, private folders, and import cycles. Existing violations are listed in a baseline file that may only shrink. See [ADR-0055](adr/0055-workspace-module-boundaries.md).

## Data ownership

Each SQLite table has one job.

- `workspace_nodes`: tree metadata, meaning where each folder and note sits.
- `documents`: the canonical structured document, plus its Markdown projection.
- `documents_fts`: the search index, a rebuildable projection.
- `app_state`: durable workspace and UI state.
- `history_cache`: history headers, rebuildable.
- `history_outbox`: revisions still waiting to be written to history.
- `sync_connection`: the identity and cursors of an optional connected workspace and device. A cursor records how far this device has read the log.
- `sync_outbox`: local operations still waiting to be sent to sync.
- `sync_blocked_operations`: operations that wait for a later sync capability or a retry, kept visible for recovery.
- `sync_received_operations`, `sync_document_heads`, `sync_tombstones`, `sync_dangling_references`: where received operations came from, the latest known head of each document, final deletion markers (tombstones), and references held back until their target exists.

See [docs/data-model.md](data-model.md).

## Performance

Performance is tested as a contract, not assumed from the choice of framework. See [docs/performance-contract.md](performance-contract.md).

The C3 production gate is the release check behind that contract ([C3 results](benchmarks/2026-07-23-product-c3.md)). It drives the real renderer, external store, shell, and editor through deterministic native bridge fixtures, which are repeatable stand-ins for the native backend. It then profiles each context separately: 1,000 and 5,000 notes, and 50, 500 and 2,000 blocks. The named Linux reference run ([results](benchmarks/2026-07-24-reference-production.md)) records 300 cached note switches with zero dropped frames, no bridge or resource work during navigation, no editor remount, zero React commits while typing, and every timing budget met. A React commit is React applying a render to the page. Raw workflow and performance samples are committed with the release evidence. Native durability is enforced by the Rust and Tauri suites, not by simulated browser state.

The mobile client has no equivalent gate yet. Its shared layer is measured at both fixture sizes: navigation makes no bridge call, and a keystroke wakes no shell subscriber. The reference-device run the contract asks for has not happened, so R-P4, the cold-start budget on a reference Android device, is unverified rather than met. See [the mobile readiness evidence](benchmarks/2026-09-20-mobile-release-readiness.md).

## Decisions

Each architecture decision record (ADR) explains why one part of the system works the way it does.

- [ADR-0001: standalone local-first product](adr/0001-standalone-local-first.md)
- [ADR-0002: SQLite is canonical](adr/0002-sqlite-canonical.md)
- [ADR-0003: operation protocol and runtime adapters](adr/0003-operation-protocol.md)
- [ADR-0004: defer UI and editor selection](adr/0004-defer-ui-editor.md)
- [ADR-0005: asynchronous Git history](adr/0005-background-git-history.md)
- [ADR-0006: native Git history materializer](adr/0006-native-git-materializer.md)
- [ADR-0007: portable workspace archive](adr/0007-portable-workspace-archive.md)
- [ADR-0008: verified native SQLite backups](adr/0008-verified-native-backups.md)
- [ADR-0009: subtree trash and permanent purge](adr/0009-subtree-trash-and-purge.md)
- [ADR-0010: backend-owned node ranking](adr/0010-backend-owned-node-ranking.md)
- [ADR-0011: graceful storage runtime shutdown](adr/0011-graceful-runtime-shutdown.md)
- [ADR-0012: lossless save batching](adr/0012-lossless-save-batching.md)
- [ADR-0013: versioned settings and note metadata](adr/0013-versioned-settings-and-note-metadata.md)
- [ADR-0014: bounded failure diagnostics](adr/0014-bounded-failure-diagnostics.md)
- [ADR-0015: scheduled backup rotation](adr/0015-scheduled-backup-rotation.md)
- [ADR-0016: deterministic operation-sequence scale fixtures](adr/0016-deterministic-scale-fixtures.md)
- [ADR-0017: verified live database swap](adr/0017-verified-live-database-swap.md)
- [ADR-0018: read-only Git history integrity and cache rebuild](adr/0018-read-only-git-history-integrity.md)
- [ADR-0019: archive compatibility fixtures](adr/0019-archive-compatibility-fixtures.md)
- [ADR-0020: UI architecture selection](adr/0020-ui-architecture.md)
- [ADR-0021: tabs and split view](adr/0021-tabs-and-split-view.md)
- [ADR-0022: import into the Skriuw monorepo as the v2 line](adr/0022-v2-monorepo-import.md)
- [ADR-0023: lossless and reference-safe Markdown transfer](adr/0023-lossless-markdown-transfer.md)
- [ADR-0024: previewed and atomic provider import](adr/0024-previewed-atomic-provider-import.md)
- [ADR-0025: embedded diagrams use a structured local model](adr/0025-embedded-diagrams.md)
- [ADR-0026: optional cloud operation replication](adr/0026-optional-cloud-operation-replication.md)
- [ADR-0027: worker-owned browser SQLite over an OPFS SAH pool](adr/0027-browser-sqlite-opfs-sah-pool.md)
- [ADR-0028: browser sync inside the storage worker](adr/0028-browser-worker-owned-sync.md)
- [ADR-0029: stored video media](adr/0029-stored-video-media.md)
- [ADR-0030: remote cover download](adr/0030-remote-cover-download.md)
- [ADR-0031: explicit task promotion](adr/0031-explicit-task-promotion.md)
- [ADR-0032: task-shaped typing is explicit intent](adr/0032-task-shaped-typing-is-explicit.md)
- [ADR-0033: provider-agnostic AI completion seam](adr/0033-ai-provider-completion-seam.md)
- [ADR-0034: annotation anchors are document data](adr/0034-annotation-anchors-are-document-data.md)
- [ADR-0035: note annotation layer](adr/0035-note-annotation-layer.md)
- [ADR-0036: AI results are reviewed in place](adr/0036-ai-results-are-reviewed-in-place.md)
- [ADR-0037: automatic sync convergence](adr/0037-automatic-sync-convergence.md)
- [ADR-0038: personal template and search preferences](adr/0038-personal-template-and-search-preferences.md)
- [ADR-0039: provider-agnostic voice transcription seam](adr/0039-voice-transcription-seam.md)
- [ADR-0040: an AI run is visible work, steered from the note](adr/0040-ai-runs-are-visible-work.md)
- [ADR-0041: cover gradients are named, not styled](adr/0041-cover-gradients-are-named-not-styled.md)
- [ADR-0042: modal Vim editing](adr/0042-modal-vim-editing.md)
- [ADR-0043: end-to-end encrypted sync](adr/0043-end-to-end-encrypted-sync.md)
- [ADR-0044: locked notes](adr/0044-locked-notes.md)
- [ADR-0045: rendered Mermaid fences](adr/0045-rendered-mermaid-fences.md)
- [ADR-0046: per-account local workspaces](adr/0046-per-account-local-workspaces.md)
- [ADR-0047: the compact shell owns the back gesture and the install offer](adr/0047-compact-shell-owns-back-and-install.md)
- [ADR-0048: a native mobile shell over the shared Rust core](adr/0048-native-mobile-shell-over-shared-core.md)
- [ADR-0049: one shared icon system](adr/0049-shared-icon-system.md)
- [ADR-0053: task due dates live in the checklist line](adr/0053-task-due-dates-live-in-the-checklist-line.md)
- [ADR-0054: recurring tasks repeat in the document](adr/0054-recurring-tasks-repeat-in-the-document.md)
- [ADR-0055: workspace module boundaries](adr/0055-workspace-module-boundaries.md)

Personal templates are ordinary notes used as sources. Saved searches, and which notes count as templates, are stored in bounded workspace preferences. See [ADR-0038](adr/0038-personal-template-and-search-preferences.md). Modal Vim editing is one `vimMode` setting. It turns on CodeMirror's Vim extension in the raw Markdown view and a Vim plugin built on the document model in the rendered editor; see [ADR-0042](adr/0042-modal-vim-editing.md). Sync refresh retries and full-text search filtered to a set of candidate notes follow the [refresh and search contract](specs/refresh-and-filtered-search.md).
