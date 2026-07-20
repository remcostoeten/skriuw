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
- Versioned portable archive with transactional replace import and integrity reporting.
- Repository rules, scripts, CI, ADRs, data model, and performance contract.

## Remaining backend work

- Native online backup, verified restore, and user-facing recovery workflow.
- Explicit trash retention and permanent-delete rules.
- Rank allocation and transactional sibling-rank compaction.
- Settings and metadata schemas with compatibility tests.
- Representative 1,000-note and 5,000-note fixtures.
- Storage lifecycle, error taxonomy, diagnostics, and graceful worker shutdown.

## UI architecture gate

Do not scaffold the product UI before measured spikes answer these questions:

- Editor engine under 50, 500, and 2,000-block documents.
- Cached document-state switching cost and memory ceiling.
- Tree virtualization behavior with nested 1,000-node and 5,000-node fixtures.
- Renderer store selector granularity and React commit counts.
- Desktop shell bridge overhead outside navigation paths.

React remains acceptable only if production profiling proves the render invariants. React Scan runs only during development and profiling. Editor internals, keystrokes, and transient selection state may not fan out through broad React subscriptions.

## MVP application work

- Persistent application shell and icon navigation.
- Reorderable, nestable note/folder sidebar with shortcuts and context menus.
- Persistent editor host with Markdown input, rendered structure, and slash commands.
- Backend-neutral metadata and history sidebar.
- Command palette and centralized command registry.
- User settings.
- Keyboard-first navigation without post-startup loading UI.

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
