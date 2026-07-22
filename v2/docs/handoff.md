# Session handoff

Last reviewed: 2026-07-22

## Start here

The backend foundation, UI architecture measurements, product shell, bounded product editor, desktop Data/Recovery surface, scheduled backups, settings, trash, history, command registry, editor find/replace, sidebar search, and responsive-panel slices are implemented on the active feature branch. Claude's original-product audit is integrated and reconciled in `docs/product-scope-v1.md`; `docs/implementation-backlog.md` is the authoritative remaining v1 plan.

```bash
cd /home/remcostoeten/dev/skriuw-standalone
git status --short
git branch --show-current
git log --oneline --decorate -15
./scripts/check.sh
```

Read, in order:

1. `AGENTS.md`
2. `TODO.md`
3. `ARCHITECTURE.md`
4. `docs/performance-contract.md`
5. Relevant ADRs under `docs/adr`

## Repository state

- Active branch: `feat/daddy-2`, expected to be 33 commits ahead of `origin/feat/daddy-2` after N2 implementation and this handoff.
- Remote: `origin` is configured; the active branch has not been pushed to its upstream state.
- Last implementation commit: `4e68559 feat: add desktop Data and Recovery surface with scheduled rotation (N2)`; C2 is `b2563e8`, N1 is `5935264`, and C1 is `57dfb4d`.
- Expected primary worktree state: only unrelated untracked `.claude/` and `b` content remains after this documentation commit; both are preserved and excluded.
- Current verification result: generated contracts, the build-entrypoint contract, formatting, Clippy, 112 backend tests (6 ignored), 15 desktop tests, 9 UI-architecture tests, 7 renderer-store tests, 99 renderer tests, renderer type safety, and `git diff --check` pass. Executed renderer coverage is 83.14% lines, 84.67% branches, and 68.04% functions.
- UI spike verification: ordinary and profiling Vite builds pass. Fresh Chrome contexts exercised every renderer-store fixture without console/page errors: 28–36 rows remained mounted, 100 trusted keydowns caused exactly 100 expected active-note transitions, traces contained exactly 100 key dispatches, and teardown returned zero listeners. Exact row/consumer allowlists, root commit counts, lifecycle guards, and browser cleanup pass.
- CLI smoke: healthy empty integrity returned `ok: 0 commit(s), 0 note(s)` without changing repository file hashes; empty rebuild returned `cached 0 history header(s)`; corrupt history exited 1 with `integrity.backend: Git history integrity check found 4 issue(s)` and no path leakage.
- Archive integration status: Claude implementation `33cf41d` was reviewed and cherry-picked as `a3f87e2`. Its stale shared-doc commit `24dddb3` was not cherry-picked.
- Archive CLI smoke imported the representative fixture, passed source integrity, exported it, imported that export into a second database, and passed second integrity; both imports reported 7 nodes and 4 documents.
- Rust toolchain: 1.95.0.
- Ignored local development database: `.data/skriuw.db`.

Run commands again. Do not trust these numbers after new commits.

## Product objective

Build a standalone desktop notes application first. After startup, navigation and frequent interactions must stay inside one frame and never await database, IPC, network, Git, Markdown parsing, or lazy loading. Preserve the existing dense navigation, nested sidebar, shortcuts, context menus, structured Markdown editor, slash menu, metadata/history sidebar, command palette, and settings. Exclude journal, people, and tags from MVP.

A later offline-capable web runtime must reuse domain operations, archives, renderer-store behavior, and fixtures. Desktop performance may not depend on a server. Web portability may not pull native compromises into hot paths.

## Architecture already implemented

```text
skriuw-domain
├── transport records
├── workspace operations
├── versioned portable settings
├── archive contract
└── pure validation

skriuw-storage
├── workspace port
├── maintenance port
├── history queue/cache ports
├── bounded diagnostic contract
└── recovery result types

skriuw-sqlite
├── native canonical storage
├── migrations and checksums
├── FTS projection
├── atomic import
├── verified backup/restore
├── scheduled recovery manifests/retention
├── transactional subtree trash/purge
└── backend-owned rank allocation/compaction

skriuw-runtime
├── serialized FIFO storage worker
├── bounded lossless save batching
└── clone-safe shutdown and worker join

skriuw-lifecycle
└── verified live-database swap and rollback orchestration

skriuw-history
├── leased retry worker
├── reader/materializer ports
└── cache rebuild orchestration

skriuw-history-git
├── native-only Git materializer
└── read-only integrity reader

skriuw-fixtures
└── portable deterministic operation-sequence workloads
```

The UI contract remains a fully hydrated in-memory workspace. Navigation is renderer-only. Persistence acknowledgements reconcile revisions later.

## Important implementation facts

- SQLite is canonical; Git is asynchronous Markdown history only.
- `WorkspaceArchive` is canonical interchange; raw SQLite backup is native recovery only.
- Import validates everything before mutation and replaces canonical state in one transaction.
- CLI import creates a verified safety backup first.
- Raw restore writes a new path and never swaps the live database.
- History Markdown loads only when a version is opened.
- Git integrity checks only the exact existing repository and `refs/heads/history`; missing, non-repository, bare, worktree-less, corrupt, nonlinear, ambiguous, or unreadable history fails without repository mutation.
- History-cache rebuild validates and enumerates complete Git history before replacing SQLite headers in one transaction.
- Direct deletion markers make their complete subtree unavailable without rewriting descendant timestamps.
- `WorkspaceSnapshot::unavailable_node_ids()` derives the active-tree projection from the hydrated parent graph.
- Search, active-note state, commands, history headers, and history claims enforce inherited unavailability.
- Trash keeps FTS and history state for instant restore; retention-guarded purge removes the complete subtree and every projection atomically.
- Create, move, and restore operations request first, last, before, or after placement instead of supplying raw ranks.
- SQLite uses immediate-neighbor midpoint allocation and compacts only the active destination sibling set when necessary.
- Operation acknowledgements coalesce final parent/rank changes by node ID for optimistic renderer reconciliation.
- Runtime shutdown rejects new work, drains accepted requests, resolves completions, and joins the worker exactly once across all clones.
- Dropping the final runtime handle joins the worker; abnormal termination is reported as `RuntimeError::WorkerFailure`.
- The runtime groups at most 64 already-queued consecutive save-only requests without waiting; every non-save or mixed request remains a FIFO barrier.
- SQLite commits each grouped save burst in one outer transaction with one savepoint and one result per original request.
- Settings are one typed version-1 document with explicit defaults and lossless unknown-field extensions; unsupported future versions fail validation.
- The reduced metadata sidebar derives from canonical node, document, and history fields. People, tags, properties, covers, secrets, and editor-specific metadata remain excluded.
- Diagnostics use stable context/category enums and normalized messages capped at 1,024 UTF-8 bytes. Public mappings redact adapter details.
- Local history retry diagnostics are bounded before SQLite persistence, cleared on the next claim, and excluded from snapshots and archives.
- Scheduled native recovery defaults to a six-hour cadence, 28 artifacts, and a 30-day age ceiling. The capability enforces cadence without owning a timer.
- Immutable recovery manifests contain relative paths only and publish before checksum-guarded pruning; manual and pre-import backups remain outside rotation.
- Live replacement verifies the candidate before shutdown, drains every runtime clone, retains the old canonical file as an explicit rollback sibling, and resumes only after replacement integrity and bootstrap pass.
- Failed post-move replacement restores and reopens the original when possible; unrecoverable rollback reports exact stage/status and preserves remaining files.
- Deterministic fixture generators create wide, nested, and mixed 1,000-note and 5,000-note operation sequences with pinned digests, declared FTS counts, and no committed generated data.
- Generated schemas live in `generated/contracts`.
- Golden archive fixtures live in `fixtures/archives`; the manifest must match every production-supported archive version.
- ADR-0020 selects React, Vite, direct ProseMirror, the dependency-free external renderer store, and Tauri 2 for the product. React Scan remains uninstalled.
- The isolated spike packages remain measurement evidence; Lexical is rejected and is not a product dependency.
- `origin` exists, but the active branch is ahead of its upstream; do not claim these commits are pushed.
- No WASM target is installed; do not claim web compilation has passed.

## Completed trash slice

- ADR-0009 defines inherited trash, explicit restore destinations, retention cutoff ownership, and irreversible purge scope.
- Portable operations are `TrashSubtree`, `RestoreSubtree`, and `PurgeSubtree`; generated JSON Schema is current.
- Trashing clears an active note anywhere below the selected root.
- Restoring an ancestor preserves descendants that were independently trashed.
- Missing, purged, and still-trashed restore destinations fail; passing `None` is the explicit workspace-root fallback.
- Purge deletes nodes, documents, FTS, history cache, and history outbox rows in one transaction.
- Nested tree, search, command, active-note, history, restore, retention, purge, and rollback regressions pass.

## Completed Trash UI slice

- Trash is a dedicated eager `#/trash` renderer route reachable from the persistent icon rail. The normal notes sidebar no longer renders a second trash section.
- The notes workspace is hidden rather than unmounted while Trash is open; browser verification preserved the exact ProseMirror DOM instance across Notes → Trash → Notes.
- The view reads only the fully hydrated `sourceNodes` and `documents` maps. Route changes, item selection, folder traversal, and rich read-only preview perform no IPC, database, filesystem, Git, network, lazy-module, or Markdown-parse work.
- Restoring a root is optimistic and uses its active original parent when possible, otherwise the explicit workspace-root fallback. Independently trashed descendants correctly become their own Trash roots after an ancestor is restored.
- Permanent subtree deletion and Empty trash use the existing retention-aware purge operation and require confirmation in a native dialog.
- The root projection is linear over the hydrated tree. The fixed-row list is keyboard navigable and virtualized; the 5,000-item regression mounts no more than 22 rows in a 720 px viewport.
- Empty, active, hover, focus, narrow-window, destructive-confirmation, and folder/note preview states are implemented with existing theme tokens and reduced-motion-safe behavior.
- Renderer verification passes 35 tests, TypeScript, the production Vite build, and `git diff --check`. Browser verification at 1440×900 and 820×760 passed route navigation, nested preview, Escape cancellation, optimistic restore, subtree promotion, accessible landmarks, and zero application console/page errors.

## Completed rank slice

- ADR-0010 defines semantic placement, 1024-point gaps, deterministic `(rank, id)` ordering, destination-only compaction, and acknowledgement behavior.
- Portable create, move, and restore operations no longer expose durable raw ranks.
- Root, nested, move-to-folder, anchor validation, repeated insertion, compaction, deterministic tie, coalescing, and rollback regressions pass.
- Five optimized-build samples for 5,000 root-note placements had a 1.805-second median after neighbor-only allocation replaced full sibling scans.
- Raw samples and environment metadata are in `docs/benchmarks/2026-07-20-rank-allocation.md`.

## Completed runtime shutdown slice

- Parallel implementation commit `c1654a8` was reviewed and integrated as `60a2337`; stale parallel handoff commit `d046277` was not cherry-picked.
- ADR-0011 defines submission revocation, FIFO draining, completion resolution, join ownership, final-drop behavior, and failure replay.
- All runtime clones share one sender and worker state. Concurrent and repeated shutdown calls join at most once and replay the stored outcome.
- Six deterministic regressions cover draining, post-shutdown rejection, clone state, concurrent shutdown, final drop, and worker panic without new sleep-based coordination.

## Completed save-batching slice

- ADR-0012 defines no-wait save grouping, the 64-request cap, FIFO barriers, request-level savepoints, commit-before-completion, and lossless history semantics.
- The storage port supplies correct sequential group behavior by default; SQLite optimizes grouped requests under one outer transaction.
- Conflicting or otherwise failed requests roll back only to their own savepoint. Successful neighbors retain independent revision acknowledgements, FTS replacements, and history-outbox rows.
- Deterministic runtime regressions cover queued batching, non-save barriers, the cap, completion order, and shutdown draining. SQLite regressions cover revision conflicts, history preservation, and group rollback isolation.
- Five optimized file-backed samples for 1,000 saves capped at 64 requests per transaction had a 79.965-millisecond grouped median versus 107.098 milliseconds sequential, a 25.3% reduction.
- Raw samples and environment metadata are in `docs/benchmarks/2026-07-20-save-batching.md`.

## Completed settings and metadata slice

- Parallel implementation commit `64cea3f` was reviewed and integrated as `5d0fff5`; stale parallel handoff commit `7a7563d` was not cherry-picked.
- ADR-0013 defines the complete version-1 settings defaults, whole-document update operation, compatibility policy, extension preservation, state ownership, and reduced metadata surface.
- Migration 0002 folds pre-release `setting:` rows into the versioned settings document. Generated operation, snapshot, and archive schemas are current.
- Domain and SQLite regressions cover defaults, partial documents, extension round trips, unsupported versions, migration, persistence, transactional rollback, export, and import.

## Completed bounded-diagnostics slice

- ADR-0014 defines stable runtime, storage, history, backup, recovery, and integrity contexts plus unavailable, invalid-input, not-found, conflict, already-exists, backend, and internal categories.
- Diagnostic messages normalize whitespace and control characters, preserve UTF-8 boundaries, and cap message data at 1,024 bytes.
- Typed errors remain internal control flow. Public projections redact backend text, entity IDs, filesystem paths, Git details, and SQLite details.
- The history queue accepts a bounded diagnostic value instead of an arbitrary error string; SQLite persists its deterministic local display only in operational outbox state.
- Runtime, storage, history, SQLite persistence, and category-boundary regressions pass. Rebuilt CLI smoke failures produced `backup.already_exists`, `recovery.backend`, and `recovery.invalid_input` without source-path leakage.

## Completed backup-rotation slice

- ADR-0015 defines default cadence, count and age retention, immutable manifest generations, publication order, pending-deletion recovery, and strict artifact ownership.
- Every scheduled artifact is normalized and verified before its manifest generation records relative filename, creation time, size, SHA-256, schema version, complete migration fingerprint, and verification state.
- Retention deletes only manifest-listed regular files whose size and checksum still match. Missing pending files are idempotent; changed files, directories, symlinks, unrelated files, manual backups, and pre-import backups are never pruned.
- One workspace gate serializes concurrent attempts. Eight deterministic regressions cover publication metadata, cadence skips, count and age retention, changed-file refusal, invalid policy/manifest handling, concurrent calls, and preservation of two valid manifest generations around corrupt older files.
- CLI commands `backup-rotate` and `backup-manifest` expose the native boundary. The full smoke created and listed a backup, skipped an early second call, restored to a new database, and passed integrity.
- Recovery procedures, live replacement, rollback retention, and CLI smoke are documented in `docs/recovery.md`.

## Completed live-database-swap slice

- ADR-0017 defines preflight, runtime shutdown, closed-WAL verification, same-directory moves, directory synchronization, replacement verification, rollback, reopen, and failure reporting.
- The native `skriuw-lifecycle` crate owns orchestration without introducing a runtime/SQLite dependency cycle. Candidate validation happens while the old runtime is usable; accepted saves drain into the retained rollback artifact before SQLite closes.
- Success returns a newly bootstrapped runtime and snapshot while every old clone remains unavailable. Post-move failure restores and reopens the original when possible; unrecoverable rollback reports the failed stage/status and preserves remaining files.
- Seven deterministic tests cover clone draining, accepted-save durability, invalid candidate and existing rollback preflight, replacement-move failure, post-move verification failure, and rollback failure. The `swap-database` CLI smoke replaced a seeded database and passed integrity for both canonical and rollback files.

## Completed scale-fixture slice

- Parallel implementation commit `3c85506` was reviewed and integrated as `3346343`; stale parallel handoff commit `584b1fb` was not cherry-picked.
- ADR-0016 defines fixtures as portable generated operation sequences with semantic placement, fixed values, and pinned SHA-256 digests rather than committed JSON or database artifacts.
- `skriuw-fixtures` generates wide, nested, and mixed workspaces at 1,000 and 5,000 notes. Metadata declares node, folder, document, operation, depth, and FTS match expectations.
- Six generator regressions cover determinism, pinned digests, validation, tree shape, search tokens, timestamps, and settings. One default SQLite test materializes a smaller fixture; the ignored manual 5,000-note run remains outside CI timing gates.

## Completed Git-integrity slice

- ADR-0018 defines the exact-repository read-only boundary, owned history ref, linear-history invariant, required metadata and content rules, cache replacement order, and failure behavior.
- `GitHistoryReader` never initializes or repairs repositories. An existing repository without `refs/heads/history` is healthy empty history.
- Inspection visits every reachable commit deterministically, rejects merges or broken ancestry, validates all four trailers, rejects duplicate outbox and note-revision identities, and requires each commit's note path to be a UTF-8 blob.
- Typed reports expose commit/note counts and typed issues. Public diagnostics redact paths, Git object IDs, libgit2 text, and backend internals.
- `history-integrity` and `history-rebuild-cache` expose explicit maintenance boundaries. Rebuild completes Git validation before opening SQLite and publishes only through transactional `replace_history_headers`.
- Seven new deterministic regressions cover healthy empty and multi-note history, non-mutating repository rejection, merges, metadata and identity corruption, note-object corruption, empty/successful rebuild, corrupt-Git cache preservation, and diagnostic redaction. Existing SQLite rollback coverage proves failed cache replacement restores the old cache.

## Completed archive-compatibility slice

- Claude implementation `33cf41d` was reviewed in its isolated worktree and integrated as `a3f87e2`; stale handoff commit `24dddb3` was excluded.
- ADR-0019 defines immutable versioned golden fixtures, exact manifest coverage, supported-version policy, canonical ordering, and the migration-plus-fixture requirement for future versions.
- Version 1 includes minimal and representative fixtures covering nesting, inherited trash, active note, non-default settings, unknown extensions, Unicode Markdown/document JSON, and deterministic timestamps and ranks.
- Five domain regressions enforce catalogue coverage, supported-version agreement, validation, semantic round trips, sensitive fields, and explicit future-version rejection.
- Three SQLite regressions prove import/bootstrap/export across two complete round trips, search and inherited unavailability, integrity, and failure-before-mutation preservation.

## UI architecture gate progress

- `6a3dad2` adds a production browser harness with deterministic equivalent 50, 500, and 2,000-block editor corpora, eight prepared notes, one persistent host, 100 cached switches, 30 editor-owned updates, raw timing samples, frame-gap/long-task observation, DOM counts, and preparation counters.
- Corrected representative end-to-layout ProseMirror switch P95 values were 1.4, 7.2, and 48.8 ms at 50, 500, and 2,000 blocks. Lexical values were 1.9, 10.3, and 40.8 ms. Five repeated 500-block runs produced median P95 values of 9.1 ms for ProseMirror and 10.9 ms for Lexical, so neither reliably passes.
- Both candidates had zero dropped observed frames in the representative 50 and 500-block runs, but repeated 500-block runs exposed five ProseMirror and nine Lexical dropped frames. Both dropped 99 observed frames in the representative 2,000-block run. Every run retained one host and performed zero preparation calls during navigation.
- The initial result rejects naive full rendered-document replacement for large notes. It does not select an editor; retained-mode evidence follows, while selection restoration, product plugins, native keyboard paint, structured Markdown fidelity, and a bounded viewport remain unmeasured.
- Full method, environment, limitations, and initial observations are in `docs/benchmarks/2026-07-21-editor-candidates-initial.md`.
- Retained mode stacks eight real, pre-laid-out inert editors and switches visibility only. Representative 500-block end-to-layout P95 values were 4.93 ms for ProseMirror and 8.53 ms for Lexical with zero dropped switch frames.
- Retained 2,000-block end-to-layout P95 values were 16.75 ms for ProseMirror and 10.22 ms for Lexical. Lexical also exceeded the frame maximum and dropped one observed switch frame.
- Retained residency reached 16,808 ProseMirror and 32,008 Lexical elements at 2,000 blocks. User-agent-specific memory deltas were 10.88 and 14.76 MiB. This rejects an unbounded retained pool as the large-note solution.
- These are provisional layout-boundary observations, not full interaction passes. Presentation timing, Long Animation Frames, repeat runs, and focus/selection restoration remain open.
- Full retained method and representative observations are in `docs/benchmarks/2026-07-21-editor-retained.md`.
- `fee2038` adds trusted ArrowDown instrumentation with exact handler/layout marks, timestamp-correlated Event Timing entries, ambient Long Animation Frames, and lifecycle guards against synthetic or partial runs.
- A production Chrome trace over five retained-ProseMirror 500-block switches recorded a 35 ms first keydown: 0.3 ms input delay, 18 ms processing, and 17 ms presentation delay. The next four Event Timing durations were 16 ms; no frame exceeded the LoAF API's 50 ms threshold.
- A separate 100-key rapid run recorded 1.175 ms handler-through-layout P95 and 1.730 ms maximum. Only 37 trusted keydown entries were exposed at the 16 ms Event Timing threshold, so missing entries remain censored rather than counted as passes.
- Full native-input method, API limitations, observations, and trace boundary are in `docs/benchmarks/2026-07-21-editor-native-presentation.md`.
- `38c6cac` adds one persistent bounded candidate per engine, retains eight complete canonical arrays outside the editor, and swaps precomputed contiguous editor states capped at 192 blocks.
- Five fresh-context 2,000-block runs recorded median end-to-layout P95 values of 3.64 ms for ProseMirror and 5.08 ms for Lexical with zero observed dropped frames. Representative DOM counts were 203 and 385; memory deltas were 2.38 and 2.90 MiB.
- Trusted rapid-input handler-through-layout P95 values were 3.75 ms for ProseMirror and 5.12 ms for Lexical. A five-key ProseMirror trace reached 42 ms and materially perturbed handler timing, so it remains presentation-phase diagnostic evidence rather than an unperturbed pass.
- This is only a precomputed static-window swap. It does not shift windows, reconcile edits into the canonical document, anchor scroll, restore selection, or preserve complete cross-window clipboard, find, IME, undo, and accessibility semantics. Raw session JSON and the trace were not committed, so fixed-runner contract evidence remains open.
- Full method, observations, evidence status, and limitations are in `docs/benchmarks/2026-07-21-editor-bounded.md`.
- Fable commits `c650d7e`, `2f56699`, and `5886aa0` were reviewed and integrated in dependency order as `c8c2cd1`, `a6ca660`, and `50cc50d`. Its later shared-doc commit `5a980e9` was not cherry-picked; its `TODO.md` and handoff intent was reconciled here against the newer primary documents.
- The Rust example exports browser tree projections from all six canonical fixtures without committing generated data. The fixed-row browser candidate uses one host, 8-row overscan, and a hard 40-row cap; recorded total DOM stayed at 163 elements for 1,000 and 5,000 nodes.
- Correctness checks cover projection metadata, iterative/reference flatten agreement, collapsed subtree exclusion, deterministic re-expansion, selection restoration after row recycling, deep parent navigation, disabled-row skipping, ARIA metadata, bounded mutation, and zero hydration during measurement.
- Nested-5000 keyboard, deep-toggle, scroll, and trusted-input paths stay within the provisional P95 budget. Full-subtree shallow expansion and deep reveal have intermittent 8–12 ms observations but stay below 16.67 ms with zero observed dropped frames. Depth-33 indentation can move content outside the narrow pane and requires a product policy.
- `d00b017` adds lifecycle guards, observer flushing, exact trusted-key verification, failure exits for correctness/browser errors, and deterministic CLI termination after the original script left a completed Node process alive.
- Full tree method, raw representative samples, variance, and limitations are in `docs/benchmarks/2026-07-21-tree-virtualization.md`.

## Completed renderer-store selector slice

- `424db78` adds `spikes/renderer-store`, generated-at-run-time canonical fixture inputs, separate ordinary/profiling React production artifacts, seven deterministic store regressions, and a fresh-profile CDP automation command.
- The normalized external store owns stable node, child, visible-order, expansion, disabled, active-note, independent focus, prepared-document, metadata, and settings identities. Equivalent updates stop before selector traversal; notification mutation, reentrant FIFO delivery, subscriber failure, disabled activation, hidden selection, and complete teardown are tested.
- The application shell and persistent editor host have no workspace subscription. Selection renders only affected mounted rows plus the editor-selection and changed metadata consumers. Editor-owned typing, equivalent updates, and selector setup/teardown produce zero React commits; expansion stays inside the tree projection.
- Clean ordinary-production observations kept every interaction-work P95 below 8 ms and every maximum below 16.67 ms. The largest was 12.165 ms for mixed-5000 expansion. Each fixture passed exactly 100 trusted keys, 100 expected active-note transitions, and 100 trace dispatch samples with no observed Long Task, LoAF, dropped-frame diagnostic, console error, page exception, or listener leak.
- Timing remains exploratory: raw results are ignored, no fixed reference runner exists, Event Timing is censored, requestAnimationFrame is pre-paint, and trace dispatch does not include final presentation. React, Vite, and this store shape are candidates only.
- Full architecture, method, raw sample summaries, render evidence, lifecycle checks, and limitations are in `docs/benchmarks/2026-07-21-renderer-store-selectors.md`.

## Completed bounded-editor correctness model slice

- `2fba493` adds a pure `createBoundedEditorProjection` model and five Node regressions to the existing UI architecture spike.
- The model keeps one canonical block array, exposes a bounded `[start, end)` window, adjusts scroll anchoring when the window moves, restores block/offset focus state, reconciles canonical edits, and rejects edits outside the rendered window.
- It intentionally does not wire into the ProseMirror DOM candidate. Browser selection, window recycling, clipboard/find, IME, undo, accessibility traversal, product plugins, and native presentation remain unmeasured.
- `spikes/ui-architecture/README.md` records the boundary and `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.

## Completed DOM-backed bounded-editor correctness slice

- The ProseMirror bounded candidate now connects one persistent `EditorView` to one canonical projection per prepared note instead of treating static prepared windows as the complete model.
- Live window movement rebuilds only the bounded state, restores exact canonical block/offset selection and editor focus, applies the projection's scroll-anchor adjustment, and refuses to recycle during IME composition.
- ProseMirror transactions reconcile rendered block text into canonical content. External canonical edits update a visible window immediately, while note switching retains the live state, canonical edit, selection, focus, and scroll projection.
- `pnpm test:browser` starts the production preview and a fresh headless Chrome profile through CDP. The 500-block regression retains one mount and one editor instance, renders 192 blocks in 203 DOM nodes, passes window, DOM selection/focus, scroll, editor/external reconciliation, note restoration, composition guard, console-error, and page-error assertions, and terminates deterministically.
- Both candidates still explicitly lack complete cross-window clipboard/find, composition requiring a window move, undo, and off-window screen-reader traversal. Lexical lacks the live controller. Final schema behavior, representative plugins, fixed-runner presentation evidence, and an editor decision remain open.

## Completed representative editor-contract slice

- The ProseMirror candidate now has a representative schema for headings, paragraphs, lists, blockquotes, fenced code, rules, links, strong and regular emphasis, and inline code. Its plugin set adds history, base and list keymaps, Markdown input rules, and slash-command query state.
- Seven UI editor regressions pass. Two product-contract tests verify every selected node and mark, Markdown serialization, slash-query state, and history depth.
- The fresh-profile production browser regression now uses 2,000 canonical blocks. It retains one host, one editor, 192 rendered blocks, and 203 DOM elements; cached switching measured 4.185 ms P95 / 6.930 ms maximum and typing measured 0.845 ms P95 / 1.305 ms maximum with zero observed dropped frames.
- The live scenario verifies undo after switching away and back, slash-query detection and undo, selection/focus restoration, scroll anchoring, bidirectional canonical reconciliation, and composition movement refusal.
- ProseMirror is selected for the remaining editor architecture. Lexical is rejected because it supplied no missing product capability and had higher bounded and retained interaction, DOM, and memory observations.
- Whole-note copy and find are canonical application commands; composition pins the window. Cross-window undo requires canonical structured transaction history, and bounded rendering requires an explicit accessible whole-document path. The current text-only canonical corpus is not lossless for rich product structure.
- Full method, decision basis, policies, and limitations are in `docs/benchmarks/2026-07-21-editor-product-contract.md`.

## Completed structured bounded-editor history slice

- Canonical bounded blocks now retain deep-cloned, schema-validated ProseMirror node JSON. The product corpus exercises marked paragraphs, bullet and ordered lists, code blocks, horizontal rules, headings, quotes, and paragraphs without flattening mounted windows to text.
- Per-note canonical undo and redo stacks survive window reconstruction. Equal prefixes and suffixes are removed from history entries so a single-block edit retains one changed block rather than a complete 192-block window; new edits clear redo.
- Product undo and redo keymaps route to the canonical boundary. The browser scenario recycles the affected block out of the DOM before undo and again before redo, then verifies exact canonical restoration and a second undo.
- The final fresh-profile run retained one host, one editor, 192 of 2,000 blocks, and 225 DOM elements. Switching measured 3.845 ms P95 / 4.950 ms maximum and typing measured 1.160 ms P95 / 1.585 ms maximum with zero observed dropped frames.
- Nine UI editor regressions, typecheck, production build, production-browser correctness, repository-wide checks, and `git diff --check` pass. One earlier exploratory structured run reached a 16.775 ms switching maximum, so fixed-runner presentation evidence remains necessary.
- Whole-note copy/find, post-composition movement, accessible whole-document behavior, history grouping/retention, and fixed-runner evidence remain open. See `docs/benchmarks/2026-07-21-editor-structured-window.md`.

## Completed desktop-bridge slice

- `spikes/desktop-bridge` is an isolated Tauri 2.11.5 production harness over the actual `WorkspaceRuntime`; it does not add a product shell or workspace dependency.
- The async command submits work before yielding and moves only `Completion::wait` to Tauri's blocking pool. One thousand local navigation projections prove zero bridge-command calls.
- Five fresh application launches recorded median throughput means of 0.220 ms empty, 0.180 ms at 1 KiB, 0.420 ms at 64 KiB, and 0.215 ms through the runtime boundary. WebKit's one-millisecond timer resolution censors individual sub-millisecond samples.
- A one-millisecond-per-item serialized storage probe queued 100 optimistic actions in 7 ms median and settled in 107 ms. All five runs kept FIFO acknowledgement order, zero dropped-frame diagnostics, and 16–17 ms maximum frame gaps while completions waited.
- Linux WebKit only was measured. Fixed-runner confirmation, Windows WebView2, macOS WKWebView, final operation envelopes, startup bootstrap payloads, and durable storage work remain outside this result. See `docs/benchmarks/2026-07-21-desktop-bridge.md`.

## Completed backend-workload slice

- Claude implementation `0f646bb` was reviewed in its isolated worktree and integrated as `97937f2`; its stale shared-doc commit `23511fd` was excluded and reconciled here.
- Two default 120-note regressions cover archive import, bootstrap, search and SQLite integrity, outbox-to-Git drain, Git integrity, validated cache rebuild, header publication, and outbox emptiness.
- Three ignored release-mode workloads record import, bootstrap, outbox-to-Git drain, and validated cache rebuild over deterministic `mixed-1000` and `mixed-5000` fixtures without adding CI timing gates.
- Recorded medians for 1,000 / 5,000 notes: archive replacement 122.090 / 1962.093 ms; bootstrap 2.720 / 13.409 ms; outbox-to-Git drain 4159.794 / 96283.068 ms; validated cache rebuild 140.193 / 2773.599 ms.
- Import currently scales worse than linearly because document projection scans archive nodes. History drain dominates at 5,000 commits but remains outside startup, editing, and navigation paths. Page-cache state was warm and uncontrolled.
- Raw samples, environment, commands, and limitations are in `docs/benchmarks/2026-07-21-backend-workloads.md`; manual commands are also in `docs/fixtures.md`.

## Architecture-gate follow-through

ADR-0020 is accepted and the product UI now exists. The whole-document ProseMirror path owns native selection, copy, IME, and accessible traversal, and `aa443ef` adds canonical-document find/replace. The validated bounded-window fallback is still not wired into the product. Fixed-runner presentation evidence and the 100-cached-switch proof remain open.

## Verification model

Backend correctness:

```bash
./scripts/check.sh
```

Recovery smoke uses an isolated temporary directory:

```bash
recovery_dir="$(mktemp -d)"
cli="target/debug/skriuw-cli"
cargo build -p skriuw-cli --locked
"$cli" init "$recovery_dir/source.db"
"$cli" seed "$recovery_dir/source.db"
"$cli" export "$recovery_dir/source.db" "$recovery_dir/workspace.json"
"$cli" backup "$recovery_dir/source.db" "$recovery_dir/backup.db"
"$cli" restore "$recovery_dir/backup.db" "$recovery_dir/restored.db"
"$cli" integrity "$recovery_dir/restored.db"
```

The product renderer now has a production profiling runner with fixed fixtures, raw timing samples, trusted keyboard input, Chrome event traces, long-task/LoAF evidence, React commits, editor mounts, DOM counts, and bridge-call assertions. C3 still requires fixed-reference-hardware and claimed-platform sign-off; React Scan remains uninstalled.

## Working rules

- Preserve branch history and user changes.
- Use `apply_patch` for edits.
- No code comments; explanation belongs in docs and ADRs.
- TypeScript uses `type`, never `interface`.
- Local component props type is `Props`.
- Prefer named function declarations and functional composition.
- Keep native filesystem, Git, SQLite, and shell code outside portable crates.
- Preserve ADR-0020's measured UI choices; new architecture changes require replacement evidence.
- Commit completed slices separately after verification.
- Update this handoff whenever branch state, test count, current limitation, or next task changes.

## Completed user-settings UI slice

- `56369b9` adds the pure version-1 settings view model and whole-document mutation helpers. `c0e382c` completes the existing settings modal without adding a route, dependency, persistence path, or lazy-loaded surface.
- Appearance and Editor expose all nine typed version-1 settings. Unrecognized theme, font, and line-height identifiers render with explicit defaults without mutating the stored document. Unknown extension fields are never rendered as editable.
- Shortcut settings enumerate `SHORTCUT_DEFINITIONS`, show effective bindings, reject conflicts, and support rebind and reset through the existing recorder. Mutations preserve unknown top-level settings and unknown nested shortcut entries.
- Opening Settings reads only the hydrated renderer store. The existing Data section remains unmounted until selected, so its storage-path IPC does not enter the open path. Saves remain optimistic complete-document `update_settings` operations with later acknowledgements.
- Five pure settings regressions cover default projection, unsupported identifier fallback, changed-field construction, unknown-field preservation, shortcut mutation, and override reset. The app has 40 passing tests; typecheck, production build, generated-contract drift, 112 backend tests, and `git diff --check` pass.

## User-settings integration gap and next task

The settings surface and persistence path are complete. Renderer consumers still need to apply hydrated theme, sidebar density and icons, reduced-motion preference, continuity, editor typography and line spacing, line numbers, and placeholder values. Keep that consumption renderer-local and selector-isolated; it must not add startup or navigation IPC.

## Completed settings accessibility refinement

- `69161aa` aligns the standalone dialog with the original Skriuw settings interaction model while retaining only the MVP sections and fields.
- The native dialog is explicitly centered at a maximum 896 × 720 CSS pixels. Its section rail is a vertical ARIA tablist with one roving tab stop, searchable section descriptions and deep setting terms, a live no-results state, and compact shortcut guidance.
- `/` focuses search from every dialog region. Search supports ArrowDown, Enter, and clear-before-close Escape behavior. `Ctrl+E` focuses the active visible section. ArrowUp/Down, Home/End, Enter, Space, ArrowRight, ArrowLeft, and F6/Shift+F6 provide section and pane navigation.
- The shared native-dialog primitive now accepts dialog-bound keyboard behavior and restores focus explicitly to the opening control after close. Headings follow the Settings `h2`, section `h3`, group `h4` hierarchy.
- Three pure navigation regressions cover deep multi-token search, roving fallback, wrapping arrows, Home, and End. A 1200 × 800 browser pass verified the exact centered bounds, accessible tree, `/`, filtered Enter, `Ctrl+E`, arrow selection, F6 cycling, two-stage Escape, trigger-focus restoration, and zero application console errors.

## Completed settings interaction parity follow-up

- `13ff3db` removes the standalone dialog header and matches the original Skriuw desktop settings geometry: 896 × 720 CSS pixels, a 220 px rail, 32/40/48 px content padding, and 24 px section `h1` headings. The dialog retains a visually hidden accessible name and an explicit content close control.
- Search keeps native focus without the previous custom focus ring. Enter from a filtered category, Enter or Space on a section tab, and ArrowRight now move focus to that section's first enabled setting control; subsequent Tab presses follow the form controls in document order.
- The registry-backed `Ctrl+,` binding now toggles Settings closed as well as open. While the modal is active, only that explicitly retained binding remains registered, so unrelated workspace shortcuts stay suspended.
- A shortcut-suspension regression covers the retained-binding model. All 62 frontend tests, TypeScript, the production build, generated-contract drift, 112 backend tests, and `git diff --check` pass. A 1200 × 800 browser pass verified the exact bounds, neutral search focus, filtered Editor activation into its first select, Tab into the next select, `Ctrl+,` close, trigger-focus restoration, and zero application console errors.

## Completed command-registry and keyboard-navigation slice

- `app/src/commands/registry.ts` defines the typed command registry: id, label, group, optional icon/keywords/hint, optional `ShortcutActionId` binding, `enabled`/`visible` predicates over `RendererState` plus a `CommandUiState` (route, sidebar/metadata/settings open), and an action. Duplicate ids and duplicate shortcut claims fail at registration.
- `app/src/commands/workspace-commands.tsx` is the single command source. It migrates the palette's former ad-hoc "New note"/"New folder" items and every `SHORTCUT_DEFINITIONS` action, and adds toggle-sidebar, toggle-metadata, focus-sidebar/editor/metadata, and go-to-notes/go-to-trash commands. Note-open and full-text "Content" palette items remain data-driven in the host.
- `WorkspaceShortcuts` actions now come from `registryShortcutActions`, so every binding runs through the registry's enabled gate. Shortcuts are no longer suspended off the notes route; per-command predicates gate workspace actions instead, so the palette, settings, and route switching work from Trash.
- New bindings (all through `SHORTCUT_DEFINITIONS`, all modifier combos honoring `worksWhileTyping` and the settings override path): mod+b sidebar, mod+alt+b metadata, mod+1/2/3 focus sidebar/editor/metadata, mod+shift+1/2 notes/trash routes.
- `app/src/commands/focus-regions.ts` focuses regions by stable selectors (`[role="tree"]` sidebar, `.prosemirror-host .ProseMirror` editor, `aside[aria-label="Note metadata"]` metadata) with no new key listeners. Lane 2: if the metadata panel's `aria-label` changes, update that selector.
- Eleven new model tests under `app/__tests__/commands/` cover registration guards, id/shortcut lookup, predicate defaults, enabled-gated run and dispatch, palette projection, shortcut coverage, route gating, and navigation. `pnpm --dir app test` (51 tests), typecheck, and the production build pass.
- Per-item sidebar context-menu entries stay component-local: they act on a right-clicked target node, which the global registry has no parameter channel for yet.

## Completed metadata/history sidebar and version restore slice

- The desktop app previously never wired Git history at all: no repository existed, nothing drained the pending-history outbox, and no bridge command could read a version's Markdown, so `historyHeaders` was always empty in practice. `app/src-tauri/src/lib.rs` now opens a `GitHistoryMaterializer` at `<database dir>/history` on startup and spawns a dedicated `skriuw-history-drain` thread over a second `SqliteWorkspace` connection that repeatedly calls `HistoryWorker::process_next`, sleeping when idle and joining on `RunEvent::Exit`. A new `read_history_version` Tauri command reads one version's Markdown on a blocking pool thread. This wiring is covered by `smoke_tests::drains_pending_history_and_reads_it_back` in `app/src-tauri/src/lib.rs`, which creates a note, drains it into a real Git commit, and reads it back.
- `app/src/shell/metadata-panel.tsx` projects `historyHeaders` through the new pure `app/src/history/version-model.ts` (`projectVersionList`, `parseHistoryMarkdown`, `buildRestoreDocument`, `buildRestoreOperation`) and renders `app/src/history/version-history-panel.tsx`, a keyboard-navigable version list backed by `readHistoryVersion` (new in `app/src/bridge/commands.ts`). Opening a version is the only IPC/parse work in the panel; the list and metadata sections render instantly from the hydrated store.
- The preview dialog reuses the existing `Dialog` primitive and renders read-only ProseMirror content parsed from the version's Markdown (`defaultMarkdownParser` against `productSchema`, matching `trash-view.tsx`'s canonical-JSON preview approach for the live document). Restore reuses the normal `save_document` operation path (`restoreNoteVersion` in `app/src/actions/workspace.ts` calls the existing `commitOperations`), so a restore is optimistic, acknowledged, and lands in history like any other edit rather than a special backend path. A confirmation step sits inside the same dialog before restoring.
- Pure model tests live in `app/__tests__/history/version-model.test.ts` (list ordering, Markdown round-trip, restore-document and restore-operation construction). No renderer-store fields were added; version selection and loaded content are local to `VersionHistoryPanel` and reset when the active note changes.
- Known caveat: history headers only refresh on bootstrap/snapshot replacement, matching the existing fully-hydrated-snapshot architecture (no live poll was added). A note saved this session will not show its own new version in the sidebar until the next bootstrap; this mirrors how search and other on-demand reads already work and was not treated as this slice's problem to solve.
- Lane 1: restoring a version and opening the history section are not yet in the command registry or palette; `app/src/history/version-history-panel.tsx` exposes `openVersion`/`requestRestore`/`confirmRestore` as candidates if you want palette/shortcut entries. No shortcuts were added beyond focus-local Arrow/Home/End navigation inside the version list.

## Completed settings-consumer integration slice

- The former user-settings integration gap is closed: every setting the dialog still offers is now applied by a renderer consumer, with no startup or navigation IPC added. Two knobs with no product surface — `showPageIcons` (notes render no icons) and `showLineNumbers` (a block editor has no line gutter) — were removed from the dialog and view model; both fields remain in the version-1 wire contract, in `DEFAULT_WORKSPACE_SETTINGS`, and in stored documents, so persistence stays lossless.
- `app/src/settings/apply-settings.ts` projects the settings document onto document-level attributes: `bindSettingsToRoot` (called once in `main.tsx` before the first render, then on every settings change through a store subscription) sets `<html data-theme>` — the mechanism `styles.css`/`themes.css` already keyed on — and toggles `data-reduce-motion`, which a global CSS override collapses transitions and animations under. Unsupported theme identifiers apply the default palette via the existing `projectSettings` fallback without rewriting the stored value.
- The editor host (`note-editor.tsx`) applies `data-editor-font` (sans/serif/mono; the stored `inter` value stays the sans default for backend compatibility), `data-editor-line-height` (cozy 1.45 / comfortable 1.7 / relaxed 1.95, replacing the hardcoded 1.6), and the empty-note placeholder. The placeholder is a new ProseMirror decoration plugin in `schema.ts` that tags a single empty paragraph with `is-editor-empty`; the text itself flows through a `--editor-placeholder` CSS custom property built by `cssStringLiteral`, so changing the setting re-renders without touching cached editor states.
- `sidebar.tsx` reads `compactSidebar` and the new `showTreeGuides` setting through narrow boolean selectors and toggles `sidebar-compact` (row height 34 → 28 CSS pixels) and `sidebar-guides` classes. Guides render as a per-row `repeating-linear-gradient` bounded by a `--tree-indent` custom property set alongside the existing indent padding, so depth-1 rows draw none and each ancestor level draws one line. `showTreeGuides` is not a version-1 wire field; it rides losslessly in the settings document's unknown-field extension bag and projects with an explicit `=== true` guard. `createInitialState` now honors `rememberLastNote === false` by ignoring the snapshot's persisted active note and falling back to the first available note; persistence of `set_active_note` is unchanged.
- New regressions: `app/__tests__/settings/apply-settings.test.ts` (root attribute projection, unsupported-theme fallback, reduce-motion toggling, CSS string escaping), `app/__tests__/editor/placeholder.test.ts` (empty-document detection), and a remember-last-note bootstrap test in `store.test.ts`. All 69 frontend tests, TypeScript, and the settings-model projection updates pass.

## Build and verification orchestrator

- `scripts/build.sh` is now the single native entry point for `check`, `web`, `desktop`, `workspace`, and `ci` modes. Every mode verifies generated contracts, the build-entrypoint contract, Rust formatting and linting, 112 backend tests, 12 desktop tests, 9 UI-architecture tests, 7 renderer-store tests, 80 renderer tests with native Node coverage, and renderer type safety before producing an artifact.
- `pnpm build`, `pnpm tauri build`, and `pnpm tauri:build` route into the orchestrator. Tauri's `beforeBuildCommand` uses the internal `build:frontend` command so a desktop build cannot recurse. `scripts/check.sh` delegates to the same verification-only mode.
- Successful steps print compact counts and timings. Failures print the focused final 240 log lines and retain the complete per-step log under `.build/logs`. Local supported terminals receive OSC-8 file links for logs, renderer bundles, the CLI, and the desktop binary.
- CI installs the official Linux Tauri prerequisites, installs the active app and spike dependencies, runs `./scripts/build.sh ci`, and uploads release artifacts plus logs. Bootstrap installs the same JavaScript test dependencies before verification.
- The public `pnpm build` and `pnpm tauri build` paths were last verified end to end at 69 renderer tests. The latest `./scripts/check.sh` run verifies 80 renderer tests with 81.38% line, 85.62% branch, and 65.49% function coverage, alongside generated contracts, formatting, Clippy, 112 backend tests (6 ignored), 12 desktop tests, 9 UI-architecture tests, 7 renderer-store tests, and renderer type safety. The last optimized desktop build completed in 2 minutes 1 second and linked the 14 MiB release binary, renderer bundle, and complete log directory.

## Completed search, sidebar, and responsive-panel slice

- `aa443ef` completes the inherited interaction work without adding dependencies or backend calls. A ProseMirror search plugin computes canonical-document matches and decorations for literal, case-sensitive, whole-word, and regular-expression queries, with wrapping navigation, replace-one, replace-all, invalid-regex handling, and save/history participation through ordinary editor transactions.
- `Ctrl+F` is a registry command and repeated use refocuses and selects the query instead of closing it. Search-only `Alt+C`, `Alt+W`, and `Alt+R` bindings remain in `SHORTCUT_DEFINITIONS` for settings overrides but mount only while the widget is open; Escape closes from either the widget or editor. The widget exposes pressed, expanded, invalid, disabled, live-result, and no-result accessibility states.
- Sidebar search filters the hydrated node projection by title with stable workspace ordering, separate folder/note groups, a 10-result cap per type, keyboard transfer between query and results, ancestor reveal, active-note state, empty results, and trigger/tree focus restoration. Expand-all and collapse-all are available from the toolbar and root context menu. Search-only node subscriptions unmount with the result surface.
- Notes layout tracks now shrink between 260/152 pixels for the sidebar and 240/180 pixels for metadata around a 300-pixel editor minimum. Closed panels unmount their subscribers, and the metadata toggle reserves the native window-control hit area when the right panel is closed. Sidebar spacing, indentation, guide intervals, and descendant counts adapt at measured width thresholds.
- New pure regressions cover search-controller lifetime, search options/navigation/replacement, sidebar result ordering/bounds, folder expansion, and panel projection. `./scripts/generate.sh`, `./scripts/check.sh`, and `git diff --check` pass: 112 backend tests, 1 desktop bridge test, 9 UI-architecture tests, 7 renderer-store tests, and 76 renderer tests. A clean mocked-native browser pass at 1200 × 800 and 720 × 800 verified load, keyboard search and replacement, option shortcuts, Escape/focus restoration, panel collapse, zero horizontal overflow, and zero page errors.

## Known gaps and immediate next task

- C2 is integrated. Notes through 192 top-level blocks retain the whole-document editor; larger notes use a 192-block canonical window with complete off-window semantics.
- The product sidebar still mounts all 5,000 tree rows (25,309 elements with the bounded editor), so the isolated tree spike's bounded row pool still needs product integration before C3.
- Note activation is renderer-only to satisfy zero navigation IPC. `rememberLastNote` now needs persistence at shutdown or another non-navigation lifecycle boundary; per-selection persistence must not return.
- React Scan remains uninstalled. C1 records production presentation evidence on the named development machine; C3 still owns fixed-reference-hardware sign-off.
- History headers still refresh only through snapshot replacement; live-session version publication remains deferred.
- Portable archive, backup, restore, scheduled rotation, live swap, and rollback are exposed through the desktop Data settings surface.
- Sidebar expansion is renderer-only and extreme-depth visual indentation is unclamped.
- Pointer drag-and-drop is post-v1. Cross-folder movement already ships through the sidebar context menu. Journal, people, tags, and the other excluded product surfaces remain out of scope.

## Product-scope reconciliation and final backlog

- Claude commit `733b1dc` audited the original Skriuw surface and added `docs/product-scope-v1.md`. It forked from `835f5dc`, before the completed `aa443ef` search/sidebar slice, so its open find, whole-document interaction, and cross-folder movement claims were stale when reviewed.
- The reconciled scope marks whole-document find/replace, native whole-document select/copy/IME/accessibility, sidebar title search, responsive panels, keyboard sibling reorder, and context-menu cross-folder movement complete. Pointer drag-and-drop and Markdown-vault formats are post-v1.
- Product decisions are fixed: the bounded fallback is required for v1 with a measured threshold; history freshness uses post-materialization publication rather than polling; Tauri owns a fixed six-hour backup timer; semantic tree depth remains unlimited while visual indentation clamps; Linux is the only currently evidenced platform.
- `docs/implementation-backlog.md` splits the remaining work into conflict-free Codex C1–C3 and Claude N1–N4 slices. Shared continuity files, generated contracts, manifests, and lockfiles remain integration-owned.
- Current verification after N2: `./scripts/check.sh` passes all 10 stages with 112 backend tests (6 ignored), 15 desktop tests, 9 UI-architecture tests, 7 renderer-store tests, and 99 renderer tests.

## Completed C1 product-renderer performance runner

- `57dfb4d` adds a production-only profiling entry around the real `App`, renderer store, sidebar, metadata consumers, and persistent ProseMirror editor. `node app/performance/run.mjs --output <path>` generates canonical tree projections, builds the runner, launches fresh Chrome profiles, and writes raw samples plus summaries and machine/revision metadata.
- Correctness failures are deterministic command failures; machine timing is evidence and does not gate shared CI. The runner asserts exact trusted-input counts, zero navigation bridge calls, zero navigation resource loads, one persistent editor host/view, zero typing React commits, and clean console/page state.
- On the named i7-10700F Linux development machine, wide-1000/50 measured 3.8 ms selection-dispatch P95, 2.0 ms editor-install P95 / 2.4 ms maximum, 7.1 ms keystroke-to-next-paint P95 / maximum, and zero dropped gaps. It meets every current budget.
- Wide-5000/500 is the first measured failing fixture: 15.0 ms selection-dispatch P95, 9.0 ms editor-install P95, and two dropped gaps. Wide-5000/2,000 reaches 56.2 ms dispatch P95, 44.3 ms editor-install P95, 102 dropped gaps, five long tasks, and 95 Long Animation Frames.
- The product sidebar mounts 1,000/5,000 tree items rather than the spike's bounded row pool. This produces 5,164 elements at 50 blocks and 25,614 at 500 blocks and remains an explicit N4/C3 correctness gap.
- The method, limitations, crossover, command, and summary are in `docs/benchmarks/2026-07-22-product-renderer.md`; complete raw samples are in `docs/benchmarks/raw/2026-07-22-product-renderer-c1.json`.

## Integrated N1 native maintenance and lifecycle coordinator

- Claude's isolated implementation `0e7d9a2` was reviewed and integrated as `5935264`; its stale shared-doc commit `40bdf67` was excluded and reconciled here against the completed C1 handoff.
- `MaintenanceCoordinator` is the single owner of the workspace runtime and history-drain thread. Every existing command obtains the current runtime through it, and desktop exit shuts both down through one path.
- New blocking-pool Tauri commands cover portable archive export/import, forced or cadence-gated backup rotation, recovery and rollback inventory, manifest-listed restore/live swap, cancellation, and maintenance status. Overlapping operations fail with a bounded conflict diagnostic.
- Export uses create-new targets. Import validates fully, stops the workspace, creates a sibling safety backup before mutation, and reopens the runtime. Restore only accepts current-manifest filenames, creates a restore candidate, drains accepted work, delegates the gated live swap, and reopens the replacement or rolled-back original before reporting a fresh snapshot.
- Eleven coordinator integration tests plus the existing history-drain smoke test cover target collision, malformed/future archives without mutation, safety-backup ordering, import/swap cancellation, cadence and inventory, successful swap/bootstrap/apply, injected replacement failure with rollback, manifest traversal rejection, overlap rejection, and diagnostic path redaction.
- Focused desktop verification and the complete `./scripts/generate.sh`, `./scripts/check.sh`, and `git diff --check` sequence pass: 112 backend tests (6 ignored), 12 desktop tests, 9 UI-architecture tests, 7 renderer-store tests, and 80 renderer tests.

## Completed C2 product bounded-editor fallback

- `b2563e8` activates the bounded product path above 192 top-level blocks, retaining the existing whole-document path at and below the validated window size. One persistent ProseMirror view and per-note prepared states survive navigation.
- The canonical model preserves structured ProseMirror nodes, reconciles changed ranges, groups undo bursts within 500 milliseconds, caps history at 200 compact entries, and supports undo/redo across recycled windows.
- Find/replace targets the full canonical document and reveals off-window matches. Whole-note select/copy emits canonical plain text and HTML; IME composition defers window movement; focus, selection, scroll, external replacement, and note-switch state restore without remounting.
- The full-note accessibility surface materializes canonical text only when focused, avoiding large accessibility-tree writes during navigation. The production runner now asserts the 192-block DOM cap and the reader path.
- On the named Linux development machine, the 2,000-block fixture measured 3.7 ms editor-install P95 / 4.5 ms maximum and 6.9 ms keystroke-to-paint P95 / 7.0 ms maximum, with zero typing React commits, navigation bridge calls, resource loads, or editor remounts. Integrated selection still records frame gaps while 5,000 sidebar rows remain mounted; N4 and C3 own that final shell proof.
- Browser verification loaded meaningful product content with one ProseMirror view, no Vite overlay, no recorded console errors, and no page-level horizontal overflow. `./scripts/generate.sh`, `./scripts/check.sh`, and `git diff --check` pass with 86 renderer tests.

## Integrated N2 desktop Data and Recovery surface

- Claude's isolated implementation `eb7947a` was reviewed and integrated as `4e68559`; its stale shared-doc commit `c283860` was excluded and reconciled here against the completed C2 handoff.
- The Data settings section now exposes portable export/import, backup-now, retained-backup and rollback inventory, and restore-and-swap through keyboard-reachable controls. Import and restore state their destructive scope before confirmation, reject duplicate submission, expose safe cancellation, and replace the renderer snapshot before interaction resumes.
- The pure maintenance phase model covers idle, confirmation, running, cancellation-requested, cancelled, not-due, success, and failure states. Recovery listings include explicit loading, empty, verification, rollback, and retry presentation without a circular spinner.
- Tauri starts a fixed six-hour backup worker with the desktop lifecycle. The coordinator enforces cadence and overlap exclusion; the worker retries after contention and uses an interruptible condition-variable wait so desktop exit joins it before shutting down the maintenance coordinator.
- Shutdown is the correct conceptual boundary for `rememberLastNote`, but the renderer-local selection is not currently available at the native exit boundary. Preserve this as an explicit lifecycle gap; do not restore per-selection navigation IPC.
- `./scripts/generate.sh`, `./scripts/check.sh`, and `git diff --check` pass with 112 backend tests (6 ignored), 15 desktop tests, 9 UI-architecture tests, 7 renderer-store tests, and 99 renderer tests.

Immediate next task: execute N3, then N4. C3 begins after both native slices are integrated.
