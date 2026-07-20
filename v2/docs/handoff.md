# Session handoff

Last reviewed: 2026-07-20

## Start here

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
- Last implementation commit before this handoff: `08144e8 feat: add verified workspace recovery`.
- Expected worktree state: clean.
- Current verification result: 33 tests plus formatting, Clippy, and generated-schema drift checks pass.
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
├── archive contract
└── pure validation

skriuw-storage
├── workspace port
├── maintenance port
├── history queue/cache ports
└── recovery result types

skriuw-sqlite
├── native canonical storage
├── migrations and checksums
├── FTS projection
├── atomic import
└── verified backup/restore

skriuw-runtime
└── serialized FIFO storage worker

skriuw-history
├── leased retry worker
├── reader/materializer ports
└── cache rebuild orchestration

skriuw-history-git
└── native-only Git implementation
```

The UI contract remains a fully hydrated in-memory workspace. Navigation is renderer-only. Persistence acknowledgements reconcile revisions later.

## Important implementation facts

- SQLite is canonical; Git is asynchronous Markdown history only.
- `WorkspaceArchive` is canonical interchange; raw SQLite backup is native recovery only.
- Import validates everything before mutation and replaces canonical state in one transaction.
- CLI import creates a verified safety backup first.
- Raw restore writes a new path and never swaps the live database.
- History Markdown loads only when a version is opened.
- Search filters directly trashed notes.
- Generated schemas live in `generated/contracts`.
- No frontend framework, desktop shell, editor, router, React, React Scan, or package manager has been added.
- No remote exists; do not claim work is pushed.
- No WASM target is installed; do not claim web compilation has passed.

## Known correctness gap

`SoftDeleteNode` updates only one node. Deleting a folder does not explicitly trash descendants. Descendants may remain individually active even when hidden through their parent. This must be resolved before tree UI or trash UI.

Immediate next slice:

1. Write ADR defining subtree trash, restore, purge, active-note, FTS, history-cache, and outbox behavior.
2. Update portable operations and regenerate schemas.
3. Implement one-transaction SQLite behavior.
4. Add nested-tree, search, active-note, restore, purge, and rollback tests.
5. Update `TODO.md`, roadmap, handoff, and commit logically.

After trash semantics, implement backend-owned rank placement and sibling compaction.

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

Performance is not yet proven because no renderer exists. React Scan alone is never proof. Final proof requires production traces, fixed fixtures, render-count assertions, long-frame measurements, memory data, and zero dropped frames during 100 cached note switches on reference hardware.

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
