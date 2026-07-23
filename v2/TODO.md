# Detailed delivery checklist

Last reviewed: 2026-07-23

## Current state

- [x] Repository created at `/home/remcostoeten/dev/skriuw-standalone`.
- [x] Current work is isolated on `feat/daddy-2`, expected to be two commits ahead of `origin/feat/daddy-2` after the N3 implementation and handoff commits.
- [x] Scoped product and dev-menu changes are committed; unrelated untracked `.claude/` content remains preserved and excluded.
- [x] Rust 1.95 backend workspace and the product renderer pass `./scripts/check.sh`.
- [x] 113 backend tests, 16 desktop tests, 9 UI-architecture tests, 7 renderer-store tests, and 101 renderer tests pass; 6 backend tests remain ignored manual workloads.
- [x] The React/Vite product renderer, persistent ProseMirror editor, Tauri desktop shell, and notes/trash hash routes are implemented.
- [x] The dev-menu Tauri entrypoint clears stale port 5183 listeners, launches through the Linux WebKit compatibility wrapper, and suppresses only the unavailable appmenu module's nonfatal GTK warning.
- [x] `origin/feat/daddy-2` is configured as the upstream branch.

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
- [x] Add import, bootstrap, and history workload measurements on the fixture generators.
- [x] Record backend raw samples and environment metadata.
- [x] Keep shared CI correctness-only until a fixed performance runner exists.

Implemented fixture contract: the portable `skriuw-fixtures` crate generates deterministic wide, nested, and mixed operation-sequence workspaces at 1,000 and 5,000 notes with pinned SHA-256 digests. Semantic placement keeps ranks adapter-owned, and declared tree and FTS expectations support native and future web workloads. The default suite materializes a smaller fixture through SQLite; the ignored 5,000-note run carries no CI timing budget. See `docs/fixtures.md` and ADR-0016.

Measured backend workloads: optimized-build medians over `mixed-1000` and `mixed-5000` were 122.090 ms / 1962.093 ms for fresh file-backed archive replacement, 2.720 ms / 13.409 ms for bootstrap, 4159.794 ms / 96283.068 ms for outbox-to-Git drain, and 140.193 ms / 2773.599 ms for validated cache rebuild. Database open was timed separately; the 5,000-note drain used three samples after a roughly 96-second probe. Raw samples, environment, commands, and limitations are in `docs/benchmarks/2026-07-21-backend-workloads.md`.

## UI architecture gate

- [x] Benchmark direct ProseMirror against at least one viable alternative.
- [x] Measure cached editor-state switching and memory ceiling.
- [x] Benchmark nested tree virtualization.
- [x] Prototype fine-grained external renderer store selectors.
- [x] Verify persistent editor host without remounting.
- [x] Measure desktop bridge overhead outside navigation.
- [x] Write ADR selecting editor, renderer store, build tool, and desktop shell.
- [x] Reject any option failing `docs/performance-contract.md`.

Initial editor spike: a production vanilla-TypeScript harness compares direct ProseMirror and Lexical over equivalent deterministic 50, 500, and 2,000-block corpora. Both meet the provisional cached end-to-layout target at 50 blocks with one host mount and zero preparation during navigation. Five repeated 500-block runs produced 9.1 ms ProseMirror and 10.9 ms Lexical median P95 values, so neither reliably meets it. Neither naive full-DOM swap survives 2,000 blocks. Repeated memory, genuinely bounded rendering, presentation timing, selection restoration, real product plugins, native keyboard paint, and final editor selection remain open. See `docs/benchmarks/2026-07-21-editor-candidates-initial.md`.

Retained editor spike: eight pre-laid-out editor panes produce representative 500-block end-to-layout P95 values of 4.93 ms for ProseMirror and 8.53 ms for Lexical, with measured memory deltas of 3.00 and 4.34 MiB. Neither meets the provisional gate at 2,000 blocks, while total DOM grows to 16,808 and 32,008 elements. This rejects an unbounded retained pool for large notes. Repeated measurements, next-paint and Long Animation Frame evidence, a bounded viewport, focus/selection and scroll restoration, plugins, native keyboard paint, and the final memory ceiling remain open. See `docs/benchmarks/2026-07-21-editor-retained.md`.

Native presentation spike: trusted ArrowDown input now records handler/layout marks, Event Timing, Long Animation Frames, and Chrome traces. A five-key retained-ProseMirror trace at 500 blocks exposed a 35 ms first interaction followed by four 16 ms Event Timing entries. A rapid 100-key run had 1.175 ms handler-through-layout P95, but only 37 entries were visible at the 16 ms Event Timing threshold. This proves Event Timing and zero LoAF cannot establish the 8 ms contract; Chrome traces remain the presentation boundary. See `docs/benchmarks/2026-07-21-editor-native-presentation.md`.

Bounded projection spike: one persistent editor swaps precomputed static windows capped at 192 of 2,000 canonical blocks. Five fresh-context end-to-layout runs produced median P95 values of 3.64 ms for ProseMirror and 5.08 ms for Lexical with zero observed dropped frames. Representative memory deltas were 2.38 and 2.90 MiB, and DOM counts were 203 and 385. This removes raw full-document swap cost but does not implement runtime window movement, canonical edit reconciliation, scroll anchoring, selection restoration, or cross-window browser/editor semantics. See `docs/benchmarks/2026-07-21-editor-bounded.md`.

Bounded correctness model: `spikes/ui-architecture/src/editors/bounded-correctness.ts` covers a pure movable window, scroll-anchor adjustment, focus/selection restoration, canonical edit reconciliation, and rejection of edits outside the rendered window. Five regressions pass and the ProseMirror bounded candidate now consumes the model.

DOM-backed bounded correctness: the ProseMirror candidate now uses the canonical projection through one persistent editor. A fresh-profile Chrome regression verifies a 192-of-500 block bound, live window movement, exact DOM selection/focus and scroll restoration, editor/external canonical reconciliation, note-switch restoration, an IME movement guard, one mount, one editor instance, and 203 active DOM nodes. Cross-window clipboard/find, composition requiring a window move, undo, off-window accessibility, Lexical parity, the final schema, representative plugins, and fixed-runner presentation evidence remain open.

Representative editor contract: the ProseMirror candidate now loads history, core keymaps, list commands, Markdown input rules, and slash-query state against a schema covering the selected Markdown blocks and marks. ProseMirror is selected for the remaining architecture work; Lexical is rejected because it showed no product capability advantage and consistently used more DOM, memory, and interaction time in the bounded and retained measurements. See `docs/benchmarks/2026-07-21-editor-product-contract.md`.

Structured bounded editor: canonical windows now preserve schema-validated ProseMirror JSON for marked text, lists, code, rules, headings, quotes, and paragraphs. Compact per-note canonical history survives actual window recycling and supports undo and redo; 31 single-block history entries retain 31 changed blocks, not 31 complete windows. The final 2,000-block production run retained one editor, 192 rendered blocks, and 225 DOM elements with 3.845 ms switching P95, 4.950 ms maximum, and zero observed dropped frames. Whole-note find/copy, composition completion, accessible traversal, bounded history policy, and fixed-runner evidence remain gates. See `docs/benchmarks/2026-07-21-editor-structured-window.md`.

Tree virtualization spike: a dependency-free fixed-row-height tree uses the canonical Rust fixture projections and keeps all six 1,000/5,000-node workspaces at no more than 40 rendered rows and 163 total DOM elements. Keyboard selection, deep toggles, scroll jumps, and trusted input stay within the provisional P95 budget. Full-subtree expansion and deep reveal at nested-5000 show sporadic 8–12 ms samples but remain below the 16.67 ms maximum with zero observed dropped frames. Correctness covers deterministic flattening, collapsed descendants, selection, keyboard navigation, ARIA metadata, and mutation bounds. Extreme-depth indentation and fixed-runner evidence remain open. See `docs/benchmarks/2026-07-21-tree-virtualization.md`.

Renderer-store selector spike: a disposable React harness normalizes the canonical 1,000/5,000-node projections behind a dependency-free external store and narrow `useSyncExternalStore` bindings. Exact production/profiling allowlists prove selection leaves the shell, tree host, persistent editor host, unrelated metadata, settings, and offscreen rows untouched; editor-owned typing and equivalent updates produce zero store notifications or React commits. Clean exploratory runs kept every P95 below 8 ms and every maximum below 16.67 ms, with 100 exact trusted transitions per fixture and no listener leak. ADR-0020 subsequently selected React, this store shape, and Vite; fixed-runner product presentation evidence remains open. See `docs/benchmarks/2026-07-21-renderer-store-selectors.md`.

Desktop bridge spike: an isolated Tauri 2.11.5 production application proves 1,000 navigation updates issue zero commands. Five-run median throughput means were 0.220 ms for empty IPC, 0.180 ms for 1 KiB, 0.420 ms for 64 KiB, and 0.215 ms through the real serialized runtime. A 100-operation delayed burst queued optimistic work in 7 ms median, preserved FIFO acknowledgements, and observed zero dropped frames while settlement took 107 ms. Linux WebKit timer quantization, fixed-runner evidence, and Windows/macOS platform runs remain open. See `docs/benchmarks/2026-07-21-desktop-bridge.md`.

Product renderer baseline: `node app/performance/run.mjs --output <path>` builds a production profiling entry around the real application and records deterministic 50-, 500-, and 2,000-block notes against canonical 1,000- and 5,000-node projections. The 50-block fixture passes every current budget at 3.8 ms selection-dispatch P95, 2.0 ms editor-install P95, 7.1 ms keystroke-to-next-paint P95, and zero dropped gaps. The 500-block fixture is the measured fallback crossover at 9.0 ms editor-install P95 and two dropped gaps; 2,000 blocks reaches 44.3 ms editor-install P95 and 102 dropped gaps. Navigation issues zero bridge calls and typing causes zero React commits. See `docs/benchmarks/2026-07-22-product-renderer.md`.

N1 integration: `5935264` adds the native maintenance/lifecycle coordinator from Claude's isolated `0e7d9a2` implementation. It owns runtime/history shutdown and reopen, archive export/import with safety backup, verified backup rotation, manifest inventory, create-new restore, live swap, rollback reporting, cancellation, overlap exclusion, and bounded diagnostics. Twelve desktop tests pass. Claude's stale shared handoff commit `40bdf67` was not integrated.

C2 integration: `b2563e8` keeps the whole-document editor through 192 blocks and activates a 192-block canonical window above that measured threshold. Structured range reconciliation, 200-entry grouped undo/redo, full-canonical find/replace, whole-note select/copy, deferred IME movement, focus/selection/scroll restoration, on-demand accessible traversal, external reconciliation, zero-navigation IPC, and one persistent ProseMirror view are implemented. The 2,000-block production fixture records 3.7 ms editor-install P95 / 4.5 ms maximum and 6.9 ms keystroke-to-paint P95 / 7.0 ms maximum with 192 editor blocks and zero typing React commits. Integrated 5,000-row shell frame gaps remain for N4/C3.

N2 integration: `4e68559` exposes archive export/import, backup creation, retained-backup and rollback inventory, restore-and-swap confirmation, cancellation, and complete maintenance states through the existing Data settings section. Tauri owns the fixed six-hour rotation and shuts its interruptible worker down before the maintenance coordinator. Fifteen desktop tests and 99 renderer tests pass.

N3 integration: `9b96d19` publishes one note-scoped history header only after Git materialization and the atomic SQLite history-cache commit succeed. The desktop drain emits a Tauri event without polling, startup subscribes before bootstrap to close the event race, and the renderer store deduplicates by version ID with deterministic ordering and note-scoped selector updates. Git and cache failures publish nothing while preserving retry behavior. One hundred thirteen backend tests, 16 desktop tests, and 101 renderer tests pass.

Immediate next task: execute N4. C3 begins after N4 is integrated.

Known continuity gap: renderer navigation no longer persists `set_active_note`, because doing so violated the zero-navigation-IPC contract. Preserve `rememberLastNote` through a shutdown or other non-navigation lifecycle boundary; do not restore per-selection IPC.

React requirements if selected:

- [ ] Add React Scan only if production Profiler and render-count evidence exposes a diagnostic gap.
- [x] Add production React Profiler harness.
- [x] Add render-count assertions.
- [x] Prove editor keystrokes do not render the application shell.
- [x] Prove note selection renders selected-note consumers only.
- [ ] Prove 100 cached note switches drop zero frames on fixed reference hardware. (C1 records zero at 50 blocks on the named development machine; C3 owns fixed-runner sign-off.)

## MVP UI

- [x] Persistent application shell and icon navigation.
- [x] Reorderable and nestable note/folder sidebar for v1. (Sibling reorder uses Alt+Arrow; cross-folder movement uses the context menu. Pointer drag-and-drop is post-v1.)
- [x] Sidebar creation, rename, trash, restore, context menus, and shortcuts.
- [x] Dedicated Trash route with renderer-local preview, restore, permanent delete, empty state, and bounded 5,000-item rendering.
- [x] Structured Markdown editor with inline rendering and a measured 192-block bounded fallback above 192 top-level blocks.
- [x] Slash-command menu.
- [x] Editor find/replace with match-case, whole-word, regex, next/previous, replace-one, replace-all, accessible status, and rebindable shortcuts.
- [x] Sidebar title search, expand/collapse-all controls, narrow-density adaptation, and bounded responsive panel tracks.
- [x] Metadata and history sidebar without people or tags.
- [x] Version preview and restore.
- [x] Central command registry and command palette. (Typed registry in `app/src/commands/` is the single source for palette items and shortcut actions; per-item sidebar context-menu entries remain local because they need a target node.)
- [x] User settings.
- [x] Keyboard-first navigation. (Registry-backed shortcuts cover sidebar/editor/metadata focus, sidebar and metadata toggles, route switching, and palette access from every route; all bindings flow through `SHORTCUT_DEFINITIONS` and the settings override path.)
- [x] Journal excluded from MVP.
- [x] No post-startup loading UI for cached workspace data.

Trash implementation: `#/trash` is eager in the startup bundle and reads only the hydrated renderer store. Active notes and folders no longer surface trashed roots in the notes sidebar. The Trash view previews canonical ProseMirror JSON without Markdown parsing, restores complete subtrees optimistically, preserves independently trashed descendants, confirms permanent deletion, and mounts at most 22 list rows for a 5,000-item trash fixture at the tested 720 px viewport.

User settings implementation: the centered, headerless 896 × 720 modal matches the original Skriuw desktop proportions, 220 px rail, content spacing, and 24 px section headings. It opens on a renderer-local Appearance section and covers every applied setting across Appearance and Editor, plus every registered shortcut and the existing explicitly selected Data section. Every change constructs and optimistically submits a complete settings document. Unsupported identifiers project to defaults without rewriting stored values, and unknown top-level plus nested shortcut extension data survives field changes, rebinds, and resets. The section rail has searchable deep terms, a vertical roving tablist, `/`, `Ctrl+E`, F6/Shift+F6, arrows, Home/End, first-control activation, sequential form tabbing, clear-before-close Escape behavior, native modal semantics, and explicit trigger-focus restoration. `Ctrl+,` toggles the dialog while other workspace shortcuts remain suspended inside it.

Settings-consumer integration: every dialog setting is applied by a renderer consumer with no startup or navigation IPC. Theme and reduced motion project onto `<html data-theme>` / `data-reduce-motion` at boot and on every settings change; editor font (sans/serif/mono system stacks), line spacing (1.45/1.7/1.95), and the empty-note placeholder apply through editor-host data attributes plus an empty-document decoration plugin; compact density and the new `showTreeGuides` indent guides toggle sidebar classes; `rememberLastNote === false` makes bootstrap ignore the persisted active note. `showPageIcons` and `showLineNumbers` were removed from the dialog and view model because no product surface consumes them; both fields remain in the version-1 wire contract and stored documents, and `showTreeGuides` rides losslessly in the unknown-field extension bag.

Search and responsive-panel implementation: editor search is a ProseMirror plugin over the active canonical document and never crosses IPC. `Ctrl+F` opens and refocuses the widget; configurable `Alt+C`, `Alt+W`, and `Alt+R` options bind only while it is open, and Escape closes from the widget or editor. Sidebar title search mounts its node subscriptions only while results are visible, caps each result type at 10, reveals collapsed ancestors on selection, restores keyboard focus, and keeps empty/active states explicit. Sidebar and metadata tracks shrink to 152 and 180 CSS pixels around a 300-pixel editor minimum, collapse by unmounting their subscribers, and reserve the native window-control hit area. A clean 720 × 800 browser pass had no horizontal overflow or page errors.

## Final v1 backlog

- [x] C1: production product-renderer performance runner and baseline.
- [x] N1: native archive, backup, recovery, live-swap, and rollback coordinator.
- [x] C2: measured-threshold bounded product editor with complete off-window semantics.
- [x] N2: desktop Data/Recovery UI and fixed six-hour scheduled rotation.
- [x] N3: non-polling live history-header publication after successful materialization.
- [ ] N4: native-only durable expansion state and clamped deep-tree indentation.
- [ ] C3: integrated keyboard end-to-end suite and fixed-hardware/platform performance sign-off.

The authoritative dependencies, file ownership, acceptance criteria, integration order, and v1 terminal condition are in `docs/implementation-backlog.md`. `docs/product-scope-v1.md` owns the v1/post-v1/excluded classification.

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

## Build and verification experience

- [x] Route workspace, renderer, Tauri, and CI builds through one native orchestrator.
- [x] Run generated-contract, formatting, lint, backend, desktop, UI-architecture, renderer-store, renderer, coverage, and type-safety checks before artifacts are produced.
- [x] Keep successful output compact while retaining complete per-step logs and focused failure diagnostics.
- [x] Print terminal hyperlinks for local binaries and bundles and upload CI artifacts and logs.
- [x] Keep Tauri's internal frontend build command recursion-free.

Verified result: the public `pnpm build` and `pnpm tauri build` paths were last exercised end to end at 69 renderer tests and produced a 14 MiB release binary with linked renderer and log artifacts. The latest `./scripts/check.sh` passes generated contracts, the build-entrypoint contract, formatting, Clippy, 112 backend tests (6 ignored), 12 desktop tests, 9 UI-architecture tests, 7 renderer-store tests, 80 renderer tests, and renderer type safety. Current executed-source renderer coverage is 81.38% lines, 85.62% branches, and 65.49% functions.
