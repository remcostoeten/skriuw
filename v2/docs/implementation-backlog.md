# Final v1 implementation backlog

Last reviewed: 2026-07-22

## Baseline and scope

This backlog reconciles Claude's product audit with the search, sidebar, and responsive-panel slice in `aa443ef`. The audited baseline passes `./scripts/check.sh`: 112 backend tests with 6 ignored workloads, 1 desktop test, 9 UI-architecture tests, 7 renderer-store tests, and 76 renderer tests.

The v1 scope is fixed by `docs/product-scope-v1.md`. Pointer drag-and-drop, third-party importers, wiki links, favorites, outline, quick-access sequences, note icons, raw Markdown mode, and the web runtime are post-v1. Journal, people, tags, tasks, AI, sharing, collaboration, authentication, sync, tabs, split view, diagrams, mobile, browser extension, hosted services, and note properties remain excluded.

## Worktree contract

Create both worktrees from the commit containing this backlog. At the start of each wave, rebase both worktrees onto the integrated preceding wave; only the two slices explicitly marked concurrent may proceed in parallel:

| Lane | Suggested branch | Suggested worktree | Exclusive production ownership |
| --- | --- | --- | --- |
| Codex | `feat/v1-renderer-proof` | `/home/remcostoeten/dev/skriuw-codex-v1-renderer` | `app/src/editor/**`, new renderer performance harnesses, renderer-only tests, performance reports |
| Claude | `feat/v1-native-completion` | `/home/remcostoeten/dev/skriuw-claude-v1-native` | `app/src-tauri/**`, native maintenance/recovery modules, `app/src/bridge/**`, `app/src/shell/settings-dialog.tsx`, `app/src/history/**`, and, for N4, sidebar/store tree files |

`TODO.md`, `docs/handoff.md`, `docs/roadmap.md`, `docs/product-scope-v1.md`, generated contracts, root manifests, and lockfiles are integration-owned. Neither worktree edits them. `app/src/app.tsx`, `app/src/main.tsx`, and shared renderer-store types are also integration points: a lane may change one only in a small standalone commit after the other lane's current wave is integrated. If a slice needs a dependency, contract-generation change, or shared manifest edit, stop at a separately committed prerequisite and integrate it before both lanes continue.

Each implementation slice ends with `./scripts/generate.sh`, `./scripts/check.sh`, `git diff --check`, a focused acceptance record, and separate implementation and handoff commits. Integration cherry-picks implementation commits in the dependency order below and rewrites shared handoff documents once.

## Wave 1: measure and establish native boundaries

The two Wave 1 slices run concurrently and touch no shared production files.

### C1 — Product renderer performance runner

Owner: Codex. Dependencies: none.

Build a production-only measurement path around the real application renderer, using deterministic 50-, 500-, and 2,000-block notes plus the 1,000- and 5,000-node fixtures. Record selection dispatch, editor installation, next paint, keystroke-to-paint, long animation frames, React commits, editor-host mounts, bridge calls, and 100 rapid keyboard switches. Do not install React Scan unless the production Profiler and render-count evidence expose a diagnostic gap.

Acceptance:

- One command runs the production fixture and writes raw samples plus P50, P95, P99, maximum, dropped frames, long tasks, commit counts, host mounts, fixture identity, revision, and machine metadata.
- Navigation performs zero IPC, database, Git, Markdown parsing, lazy loading, and editor remounts.
- The 50-block fixture meets every current budget; 500- and 2,000-block results identify the measured fallback crossover without hiding failures.
- The runner fails correctness assertions deterministically but does not impose timing gates on shared CI.

### N1 — Native maintenance and lifecycle coordinator

Owner: Claude. Dependencies: none.

Add a narrow native application boundary for portable archive export/import, verified backup rotation, recovery-manifest listing, create-new restore, live database swap, and rollback reporting. Tauri application state must own shutdown/reopen safely; maintenance waits run away from renderer and UI threads. No filesystem path, SQLite type, or Tauri type enters domain contracts.

Acceptance:

- Export uses a user-selected create-new target and emits the versioned portable archive; import validates completely and creates its safety backup before mutation.
- Restore never overwrites the open database directly; live swap drains accepted work, retains an explicit rollback sibling, verifies/reopens/bootstrap-checks the replacement, and recovers the original on failure where possible.
- Diagnostics are bounded and redacted at the command boundary; recovery-relevant failures remain visible.
- Integration tests cover cancellation, existing targets, malformed archives, failed import without mutation, failed swap with rollback, and successful bootstrap after swap.
- No command runs during note navigation, and no maintenance wait blocks the renderer or Tauri UI thread.

## Wave 2: close renderer and desktop product gaps

Wave 2 starts after both Wave 1 commits are integrated. C2 and N2 may run concurrently.

### C2 — Product bounded-editor fallback (complete in `b2563e8`)

Owner: Codex. Dependencies: C1.

Port the validated structured 192-block window into the persistent product editor and choose its activation threshold from C1's product measurements. Preserve canonical rich JSON, compact per-note history, search/replace across off-window blocks, composition pinning and deferred movement, selection/focus/scroll restoration, whole-note select-all/copy, and an accessible whole-document path.

Acceptance:

- One editor host and one editor instance survive 100 switches between whole-document and bounded notes.
- The 2,000-block fixture renders at most 192 canonical blocks in the editor DOM and meets cached-swap and keystroke budgets on the evidenced development machine, pending fixed-runner sign-off.
- Search, replace, select-all, copy, undo/redo, IME completion, accessibility traversal, external reconciliation, and note switching cover content outside the active window.
- The threshold and evidence are recorded; notes below it retain the simpler whole-document path.
- Editor keystrokes cause no application-shell render and navigation performs no IPC or parsing.

### N2 — Desktop Data and Recovery surface plus scheduled rotation (complete in `4e68559`)

Owner: Claude. Dependencies: N1.

Wire the native coordinator into the existing Data settings section. Add archive export/import, backup-now, retained-backup listing, restore-and-swap confirmation, progress, cancellation where safe, success, and failure states. Tauri owns a fixed six-hour backup timer for v1; no new user setting is added.

Acceptance:

- Every archive, backup, and restore flow is reachable by keyboard from the desktop UI and no longer requires the CLI.
- Import and restore show destructive scope before confirmation, disable duplicate submission, and keep the current workspace usable after any pre-swap failure.
- Successful live swap replaces the renderer snapshot before interaction resumes and exposes the retained rollback artifact without leaking paths in generic errors.
- Rotation starts with the desktop lifecycle, respects the existing cadence/retention manifest, cannot overlap itself, and shuts down cleanly.
- Empty, due/not-due, in-progress, cancelled, success, verification-error, and rollback-error states have regressions and no circular spinner.

## Wave 3: freshness and durable shell state

These Claude-owned slices are sequential because both extend the native application boundary. They do not touch Codex-owned editor files.

### N3 — Live history-header publication

Owner: Claude. Dependencies: N1 and N2 lifecycle ownership.

Publish a bounded header update only after the background materializer has completed the matching outbox item and the SQLite history cache is committed. Update narrow renderer-store history consumers without replacing the workspace snapshot. Do not poll and do not make saves or navigation await Git.

Acceptance:

- A successful save appears in the open note's history list during the same session after materialization, exactly once and in stable order.
- Git failure leaves the save acknowledged, preserves retry state, and publishes no false header.
- Switching notes, closing metadata, or exiting during publication leaks no listener and causes no broad shell render.
- History header publication performs no work on the editing or navigation path.

### N4 — Durable expansion and deep-tree presentation

Owner: Claude. Dependencies: N2.

Persist sidebar folder expansion as native UI state excluded from portable archives, and clamp visual indentation while preserving arbitrary semantic depth and correct ARIA levels. Search reveal and expand/collapse-all participate in the same persistence path without delaying their local paint.

Acceptance:

- Expansion restores after desktop restart, survives node movement, drops purged IDs, and is absent from archive exports.
- Toggle, search reveal, expand-all, and collapse-all update renderer state synchronously and persist through a coalesced background acknowledgement.
- A depth-33 fixture stays readable without horizontal page or sidebar overflow; titles retain useful width while `aria-level` remains exact.
- The 5,000-node render and interaction budgets remain intact and failed persistence cannot corrupt canonical workspace content.

## Wave 4: integrated release proof

### C3 — Product end-to-end and performance gate

Owner: Codex after rebasing its worktree onto integrated C2 and N4. Dependencies: C2, N2, N3, and N4.

Add keyboard-driven production-build scenarios for the complete v1 workflow: create, rename, nest, sibling reorder, cross-folder context-menu move, write, slash command, find/replace, sidebar search, trash/restore/purge, metadata, live history restore, palette, rebindable shortcuts, settings, archive round trip, backup, and recovery. Run the performance suite on the named reference machine and on every claimed release platform.

Acceptance:

- The end-to-end workflow has zero console/page errors and verifies complete empty, error, disabled, active, focus-restoration, and reduced-motion states.
- `./scripts/generate.sh`, `./scripts/check.sh`, `git diff --check`, the production web build, and the optimized Tauri build pass.
- One hundred cached switches drop zero frames; cached swap P95 is below 8 ms and max below 16.67 ms; keystroke-to-paint P95 is below 8 ms and max below 16.67 ms; no navigation task exceeds 8 ms.
- Render and bridge assertions prove every hard invariant in `docs/performance-contract.md`.
- Linux is the only default release claim. Windows and macOS enter the release matrix only after their identical suite passes and their evidence is committed.

## Integration order and terminal condition

Cherry-pick in this order: C1 and N1 in either order, then C2 and N2 in either order, then N3, N4, and C3. Resolve no implementation conflict by silently dropping either side; rerun the focused tests for every touched boundary after integration.

v1 implementation is complete only when C3 passes on named reference hardware, the desktop archive/backup/recovery path is user-accessible, live history is fresh, expansion state is durable, the 2,000-block editor path satisfies the contract, and every strict-v1 box in `docs/product-scope-v1.md` is checked. Post-v1 work does not begin before that terminal condition unless the product scope is changed by a new decision.
