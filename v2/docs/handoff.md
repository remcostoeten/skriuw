# Session handoff

Last reviewed: 2026-07-21

## Start here

Backend workload measurements plus the replacement, retained, native-presentation, static and DOM-backed bounded-editor, tree-virtualization, renderer-store selector, and desktop-bridge spikes are complete on the primary branch.

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

- Active branch: `feat/instant-local-first-foundation`.
- Remote: none configured.
- Last implementation commit: `596859a feat: preserve rich bounded editor history`; the representative editor contract is `a20d669`, desktop bridge is `cc58d22`, DOM-backed editor is `23c88b6`, pure bounded model is `2fba493`, and renderer-store implementation is `424db78`.
- Expected primary worktree state: clean after the handoff commit following `596859a`.
- Current verification result: 112 backend tests, seven renderer-store tests, nine UI editor tests, one fresh-profile structured 2,000-block bounded-editor browser regression, and five native desktop-bridge measurement runs pass with formatting, Clippy, generated-schema drift checks, both renderer-store production builds, the UI spike typecheck/build, the Tauri release build, and `git diff --check`; five manual backend benchmarks and one manual fixture materialization remain ignored by the default suite.
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
- No product frontend framework, desktop shell, editor, router, React, React Scan, or package-manager workspace has been added. Tauri, React, Vite, ProseMirror, and Lexical remain isolated measurement dependencies only.
- The isolated `spikes/ui-architecture` package uses pnpm, Vite, direct ProseMirror, and direct Lexical only as disposable measurement dependencies; none is selected for the product.
- No remote exists; do not claim work is pushed.
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

## Known correctness gap and next task

Implement canonical whole-note select-all/copy and find, complete deferred movement after IME composition, and prototype an accessible whole-document path. Define bounded history grouping and retention before fixed-runner presentation evidence. These still precede ADR-0020 and product UI scaffolding.

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

The disposable renderer proves selector isolation but does not select or implement the product renderer. React Scan alone is never proof. Final proof still requires production traces, fixed fixtures, long-frame/presentation measurements, memory data, and zero dropped frames during 100 cached note switches on reference hardware.

## Working rules

- Preserve branch history and user changes.
- Use `apply_patch` for edits.
- No code comments; explanation belongs in docs and ADRs.
- TypeScript uses `type`, never `interface`.
- Local component props type is `Props`.
- Prefer named function declarations and functional composition.
- Keep native filesystem, Git, SQLite, and shell code outside portable crates.
- Do not scaffold UI before benchmark gates are complete.
- Commit completed slices separately after verification.
- Update this handoff whenever branch state, test count, current limitation, or next task changes.
