# Delivery roadmap

## Goal

Build a standalone desktop notes application whose post-startup navigation and frequent interactions remain inside one frame. Preserve the existing product's dense shell, note tree, shortcuts, context menus, command palette, structured Markdown editing, metadata, settings, and history while excluding journal, people, and tags from the first release.

Keep domain records, operations, editor documents, and renderer state portable enough for a later offline-capable web runtime. Desktop performance may not depend on a server. Web portability may not weaken the native desktop path.

## Completed foundation

- Versioned workspace operations and generated JSON Schema contracts.
- Pure adapter-independent operation validation.
- Native SQLite schema, FTS projection, optimistic revisions, and atomic batches.
- Ordered SHA-256 migration ledger with drift detection and legacy development-data upgrade.
- Serialized FIFO storage runtime.
- Backend-neutral leased history queue and retryable materialization worker.
- Native idempotent Git materializer isolated from portable and web crates.
- Backend-neutral history reads and atomic cache rebuild from Git.
- Read-only Git history integrity verification and explicit transactional cache-rebuild CLI.
- Versioned portable archive with transactional replace import and integrity reporting.
- Immutable golden archive fixtures covering every supported version through domain and SQLite round trips.
- Verified online SQLite backup, create-new restore, and import safety backup.
- Explicit inherited subtree trash, restore fallback, retention-guarded permanent purge, and atomic projection cleanup.
- Backend-owned semantic tree placement, midpoint ranks, destination-only compaction, and reconciliation acknowledgements.
- Clone-safe runtime shutdown that drains accepted work and joins the storage worker.
- Lossless bounded save batching with FIFO barriers, request savepoints, and individual acknowledgements.
- Versioned portable settings with defaults, extension preservation, migration, and an explicit reduced metadata contract.
- Bounded categorized diagnostics across runtime, storage, history retry, backup, recovery, and integrity boundaries.
- Scheduled verified backup rotation with immutable recovery manifests and checksum-guarded retention.
- Native runtime shutdown, verified live-database swap, rollback, reopen, and bootstrap orchestration.
- Deterministic portable 1,000-note and 5,000-note fixture generators with tree and FTS expectations.
- Repository rules, scripts, CI, ADRs, data model, and performance contract.

## Remaining backend work

- Native application coordinator and desktop UI for archive import/export, backup, restore, live swap, and rollback presentation.
- Fixed six-hour desktop backup-timer ownership.
- Non-polling live history-header publication after successful materialization.
- Durable sidebar expansion operation and native-only persistence.
- Fixed-runner confirmation of recorded workloads and final product interactions.

## UI architecture and MVP state

ADR-0020 accepted React, Vite, direct ProseMirror, the dependency-free external renderer store, and Tauri 2 after the editor, tree, selector, and bridge gates completed. The product shell, persistent whole-document editor, measured 192-block large-note fallback, slash menu, tree, trash, metadata/history, command registry, palette, settings, keyboard navigation, editor find/replace, sidebar title search, and responsive panel behavior are implemented.

The remaining renderer work is deep-tree indentation and tree-row bounding through N4, followed by the integrated end-to-end/fixed-hardware proof in C3. React Scan remains optional diagnostic tooling, never production evidence.

The final sequence, worktree ownership, and measurable acceptance criteria are maintained in `docs/implementation-backlog.md`.

## Web path

- Reuse workspace operations, generated contracts, renderer store shape, and performance fixtures.
- Replace native SQLite with worker-owned SQLite-WASM over durable browser storage.
- Replace native Git materialization with local revision snapshots or a remote history adapter.
- Add network sync only through a durable outbox; navigation never waits for network work.
- Keep desktop and web adapter contract tests identical where capabilities overlap.

## Proof gates

### Correctness

- `./scripts/check.sh` passes formatting, Clippy, tests, and generated-contract drift checks.
- Every domain invariant and recovery path has a regression test.
- Every migration is ordered, checksummed, transactional, and upgrade-tested.

### Performance

- Production-build fixtures satisfy `docs/performance-contract.md` on fixed reference hardware.
- One hundred cached note switches drop zero frames.
- Navigation performs no database, IPC, network, Git, Markdown parsing, or lazy loading.
- Editor keystrokes do not render the application shell.
- React profiling and render-count assertions agree with React Scan investigations.

### Product

- Shortcut and interaction inventory passes against the reduced MVP specification.
- Sidebar nesting, reorder, context menu, editor, metadata, history, command palette, and settings pass keyboard-driven end-to-end tests.
- No journal, people, or tags enter MVP scope without a new decision.

## Decision discipline

- Record durable architecture changes as ADRs.
- Use benchmark spikes before choosing expensive UI, editor, Git, or browser-storage dependencies.
- Reject convenience abstractions that introduce work into navigation or editing paths.
- Treat failing correctness, performance, and product gates as evidence that the architecture is off track.
