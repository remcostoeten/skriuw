# Detailed delivery checklist

Last reviewed: 2026-07-21

## Current state

- [x] Repository created at `/home/remcostoeten/dev/skriuw-standalone`.
- [x] Work isolated on `feat/instant-local-first-foundation`.
- [x] Logical commits created; working tree clean after the last verified implementation commit.
- [x] Rust 1.95 backend workspace builds with `./scripts/check.sh`.
- [x] 110 backend tests pass; two manual backend benchmarks and one manual fixture materialization are ignored by the default suite.
- [x] No frontend, desktop shell, router, React dependency, or editor dependency exists.
- [x] No Git remote is configured.

## Completed backend foundation

- [x] Versioned workspace operation envelope.
- [x] Generated JSON Schema contracts with drift checking.
- [x] Pure operation and archive validation.
- [x] SQLite canonical schema with FTS5 and WAL mode.
- [x] Ordered SHA-256 migration ledger.
- [x] Legacy development-database upgrade.
- [x] Atomic operation batches and optimistic document revisions.
- [x] Serialized FIFO storage runtime.
- [x] Leased, crash-retryable history outbox.
- [x] Native-only idempotent Git materializer.
- [x] Lazy Git history headers and Markdown version reads.
- [x] Atomic history-cache rebuild.
- [x] Portable desktop/web workspace archive.
- [x] Transactional replace import.
- [x] SQLite, foreign-key, migration, and domain integrity reporting.
- [x] WAL-safe online backup producing one normalized file.
- [x] Verified create-new restore.
- [x] CLI backup, restore, export, import, integrity, search, seed, and snapshot flows.
- [x] Import safety backup.
- [x] Deleted notes excluded from FTS search.

## P0: tree and trash correctness

- [x] Define subtree trash semantics in an ADR.
- [x] Replace ambiguous single-node delete behavior with explicit subtree behavior.
- [x] Ensure descendants of a trashed folder cannot appear in tree, search, active-note state, or commands.
- [x] Decide whether descendant timestamps are changed or ancestor trash state is inherited.
- [x] Define restore behavior when the original parent is missing, purged, or still trashed.
- [x] Add permanent purge operation with explicit scope.
- [x] Add retention-policy boundary; scheduling may remain deferred.
- [x] Remove purged documents from canonical tables, FTS, history cache, and pending history queue atomically.
- [x] Add tests for nested trash, restore, active note, search, rollback, and purge.

Implemented contract: direct trash markers are inherited through ancestry. Restore requires an active destination or explicit root fallback. Purge is subtree-scoped and rejects direct trash markers newer than its retention cutoff.

## P0: ordering and rank allocation

- [x] Record rank-allocation decision in an ADR.
- [x] Stop requiring UI code to invent durable raw ranks without backend guidance.
- [x] Define first, last, before, after, and move-to-folder placement semantics.
- [x] Allocate midpoint ranks when space exists.
- [x] Compact only one sibling set when no midpoint exists.
- [x] Return all rank changes required for optimistic-state reconciliation.
- [x] Preserve stable ordering across desktop and future web adapters.
- [x] Test root and nested lists, repeated insertion, compaction, rollback, and deterministic ties.
- [x] Benchmark 5,000 sibling operations outside the navigation path.

Measured result: five optimized-build samples for one atomic batch of 5,000 root-note placements had a 1.805-second median on the recorded development machine. See `docs/benchmarks/2026-07-20-rank-allocation.md`.

## P1: storage lifecycle and recovery

- [x] Add graceful shutdown and worker join semantics.
- [x] Define save batching/coalescing without losing revision acknowledgements.
- [x] Add bounded diagnostics for runtime, storage, history, backup, and recovery failures.
- [x] Add scheduled backup rotation policy.
- [x] Add recovery-manifest metadata and retention tests.
- [x] Add desktop lifecycle flow for verified database swap after restore.
- [x] Add Git repository integrity check and cache-rebuild command.
- [x] Add full export/import compatibility fixtures for every archive version.

Implemented Git integrity contract: an exact existing non-bare repository is inspected without mutation from `refs/heads/history`. Reachable commits must form one linear chain with unique valid identities, complete metadata, and readable UTF-8 note blobs. Cache rebuild enumerates and validates Git before one transactional SQLite replacement; Git or SQLite failure preserves the old cache. CLI integrity and rebuild commands are explicit maintenance work outside startup and interaction paths. See ADR-0018.

Implemented archive compatibility contract: immutable versioned golden JSON fixtures catalogue every production-supported archive version. Domain tests pin deserialization, validation, sensitive fields, Unicode, extensions, and explicit future-version rejection. SQLite tests prove import, bootstrap, search, integrity, export, second import/export, and failure-before-mutation behavior. See `docs/archive-fixtures.md` and ADR-0019.

Implemented save contract: the runtime groups at most 64 already-queued consecutive save-only requests without waiting, preserves non-save FIFO barriers, and returns one result per original request. SQLite uses one outer transaction with request savepoints, so conflicts remain isolated and every successful revision retains its own FTS and history-outbox update. Five optimized 1,000-save samples had a 79.965-millisecond grouped median versus 107.098 milliseconds sequential. See `docs/benchmarks/2026-07-20-save-batching.md`.

## P1: settings and metadata

- [x] Define versioned settings schema and defaults.
- [x] Define note metadata required by the right sidebar.
- [x] Keep people and tags outside MVP.
- [x] Add compatibility and unknown-field tests.
- [x] Decide which UI state is durable, session-only, or renderer-only.

Implemented settings contract: one typed version-1 document with explicit defaults replaces untyped per-key values. Unknown fields survive load, save, export, and import; unsupported future versions fail explicitly. Existing canonical node/document/history fields cover the reduced right sidebar, so people, tags, properties, secrets, and renderer-only state remain excluded. Native sidebar expansion persistence is a later UI-linked operation.

Implemented diagnostic contract: stable context/category enums project typed subsystem errors into redacted, normalized messages capped at 1,024 UTF-8 bytes. History retry persistence accepts only a bounded diagnostic record; backup, restore, import, and integrity CLI failures map at their operation boundary. No telemetry or diagnostic upload exists.

Implemented recovery rotation: the native default is one verified backup every six hours, at most 28 retained artifacts, and a 30-day age ceiling. Immutable create-new manifests record relative names, timestamps, sizes, file SHA-256 values, schema versions, migration fingerprints, verification state, and retryable pending deletions. Pruning requires an exact manifest record plus regular-file, size, and checksum matches.

Implemented live-swap contract: preflight verifies a create-new candidate before runtime shutdown. Shutdown drains and joins all clones, the canonical database moves to an explicit rollback sibling, the candidate moves into place, and the replacement must pass read-only verification, normal open, integrity, and bootstrap before a new runtime is returned. Post-move failures restore and reopen the original when possible; failed rollback is reported explicitly without deleting remaining files.

## P1: scale fixtures and backend budgets

- [x] Generate deterministic 1,000-note and 5,000-note workspaces.
- [ ] Generate 50, 500, and 2,000-block documents after editor schema selection.
- [ ] Add import, bootstrap, and history workload measurements on the fixture generators.
- [ ] Record raw samples and environment metadata.
- [x] Keep shared CI correctness-only until a fixed performance runner exists.

Implemented fixture contract: the portable `skriuw-fixtures` crate generates deterministic wide, nested, and mixed operation-sequence workspaces at 1,000 and 5,000 notes with pinned SHA-256 digests. Semantic placement keeps ranks adapter-owned, and declared tree and FTS expectations support native and future web workloads. The default suite materializes a smaller fixture through SQLite; the ignored 5,000-note run carries no CI timing budget. See `docs/fixtures.md` and ADR-0016.

## UI architecture gate

- [x] Benchmark direct ProseMirror against at least one viable alternative.
- [ ] Measure cached editor-state switching and memory ceiling.
- [ ] Benchmark nested tree virtualization.
- [ ] Prototype fine-grained external renderer store selectors.
- [x] Verify persistent editor host without remounting.
- [ ] Measure desktop bridge overhead outside navigation.
- [ ] Write ADR selecting editor, renderer store, build tool, and desktop shell.
- [ ] Reject any option failing `docs/performance-contract.md`.

Initial editor spike: a production vanilla-TypeScript harness compares direct ProseMirror and Lexical over equivalent deterministic 50, 500, and 2,000-block corpora. Both pass cached switching at 50 blocks with one host mount and zero preparation during navigation. Five repeated 500-block runs produced 9.1 ms ProseMirror and 10.9 ms Lexical median P95 values, so neither reliably passes. Neither naive full-DOM swap survives 2,000 blocks. Memory, retained/bounded rendering, selection restoration, real product plugins, native keyboard paint, and final editor selection remain open. See `docs/benchmarks/2026-07-21-editor-candidates-initial.md`.

React requirements if selected:

- [ ] Install React Scan for development/profiling only.
- [ ] Add production React Profiler harness.
- [ ] Add render-count assertions.
- [ ] Prove editor keystrokes do not render the application shell.
- [ ] Prove note selection renders selected-note consumers only.
- [ ] Prove 100 cached note switches drop zero frames on reference hardware.

## MVP UI

- [ ] Persistent application shell and icon navigation.
- [ ] Reorderable and nestable note/folder sidebar.
- [ ] Sidebar creation, rename, trash, restore, context menus, and shortcuts.
- [ ] Structured Markdown editor with inline rendering.
- [ ] Slash-command menu.
- [ ] Metadata and history sidebar without people or tags.
- [ ] Version preview and restore.
- [ ] Central command registry and command palette.
- [ ] User settings.
- [ ] Keyboard-first navigation.
- [ ] No journal.
- [ ] No post-startup loading UI for cached workspace data.

## Future web runtime

- [ ] Compile and test portable crates for `wasm32-unknown-unknown`.
- [ ] Add worker-owned SQLite-WASM adapter over durable browser storage.
- [ ] Run shared operation, archive, tree, and recovery fixtures against native and web adapters.
- [ ] Select local revision or remote history materializer.
- [ ] Add durable sync outbox only if sync enters scope.
- [ ] Keep network work outside navigation and editing paths.

Current caveat: the WASM target is not installed and no WASM build has been claimed. Git exclusion is structural through target-gated dependencies.

## Required proof before every completed slice

- [ ] `git diff --check` passes.
- [ ] `./scripts/check.sh` passes.
- [ ] New invariants have regression tests.
- [ ] Generated schemas are committed when contracts change.
- [ ] ADR and roadmap are updated when architecture changes.
- [ ] `docs/handoff.md` and this file reflect new state.
- [ ] Changes are committed on the feature branch in logical order.
