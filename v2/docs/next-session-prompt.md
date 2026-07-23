# Next Codex session instruction

Continue the standalone v1 completion in
`/home/remcostoeten/dev/skriuw-standalone`.

Read `AGENTS.md`, `TODO.md`, `docs/handoff.md`, `ARCHITECTURE.md`,
`docs/performance-contract.md`, `docs/implementation-backlog.md`, ADR-0013,
ADR-0020, and the relevant source before changing code. Verify the branch,
upstream divergence, worktree, recent commits, processes, and test state rather
than trusting recorded counts. Preserve the unrelated `.claude/` directory.

N3 is integrated as `9b96d19` plus handoff `179e45d`. N4 is integrated as
`1e426ba` plus handoff and committed evidence `9bbda13`. The exact N4 product
tree evidence is in `docs/benchmarks/2026-07-23-product-tree-n4.md` and its raw
JSON. N4 bounds the product tree, persists native-only expansion, clamps visual
indentation, and passes deterministic browser assertions. Do not hide the
recorded selection-dispatch variance or the single 17.2 ms 2,000-block editor
installation maximum; C3 owns fixed-runner sign-off.

First inspect the worktree for the delegated `rememberLastNote` lifecycle
slice. It must persist the renderer-local active note only at a genuine
close/exit boundary, never issue per-selection IPC, never make navigation wait,
avoid close-event recursion, wait safely for the accepted durable operation,
continue shutdown after bounded failure, and honor `rememberLastNote=false`.
Review every change yourself, run focused tests, fix findings, run
`./scripts/generate.sh`, `./scripts/check.sh`, and `git diff --check`, then
commit implementation and integration-owned handoff updates separately. If the
delegated slice is absent or incomplete, implement it before C3.

Then execute C3 from `docs/implementation-backlog.md`:

- Build keyboard-driven production scenarios for create, rename, nest, sibling
  reorder, context-menu cross-folder move, writing, slash command,
  find/replace, sidebar search, trash/restore/purge, metadata, live history
  restore, palette, shortcut rebinding, settings, archive round trip, backup,
  and recovery.
- Verify empty, error, disabled, active, reduced-motion, and focus-restoration
  states with no console or page errors.
- Keep navigation independent from IPC, database, Git, parsing, resource
  loading, and editor remounts. Keep editor typing outside React.
- Run the production performance fixtures on the named Linux reference
  machine. Record raw data and honest limitations. Require 100 cached switches
  with zero dropped frames, cached swap and keystroke P95 below 8 ms, maximum
  below 16.67 ms, and no navigation task above 8 ms.
- Run the production web build and optimized Tauri build. Linux is the only
  release claim unless the identical suite passes elsewhere.

Use the Tauri v2 guidance for native lifecycle/IPC changes, the React review
checklist after TSX changes, and browser verification for every started preview
or dev server. Do not add dependencies, frameworks, animation, or React Scan
without measured need. Update `TODO.md`, `docs/handoff.md`, roadmap/scope,
architecture, and benchmark evidence after verified slices. Commit in
dependency order. Do not push or open a pull request unless the user asks.
