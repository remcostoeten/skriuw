# Prompt: Workspace & note export/import (Markdown)

Implement Markdown export and import for skriuw
(/home/remcostoeten/dev/skriuw-standalone). Work end-to-end without asking
for permission. This is the trust feature for an open-source local-first
note app: users must be able to get their notes out, and migrate in.

## Scope

1. **Export a single note** — command palette action + note context menu
   entry ("Export as Markdown…"). Writes `<title>.md`.
2. **Export the whole workspace** — settings or command palette action
   ("Export workspace…"). Writes the folder tree as directories and each
   note as a `.md` file, mirroring the sidebar hierarchy. Sanitize
   filenames (strip `/ \ : * ? " < > |`, dedupe collisions with ` (2)`
   suffixes).
3. **Import** — "Import Markdown…" action: pick a folder, walk `*.md`
   files (recursing into subdirectories → folders in the tree), create
   notes via the existing operation pipeline so history/undo/references
   all work. Parse with the already-present `prosemirror-markdown`
   parser; unparseable files import as plain paragraphs, never fail the
   whole import. Show a completion summary (N notes, M folders, K
   skipped).

## Existing plumbing to reuse — do not reinvent

- Markdown serialization already exists: `serializeProductMarkdown` in
  `app/src/editor/schema.ts` (it runs on every save; `DocumentRecord`
  in the store already holds `markdown` per note).
- The tree structure lives in the renderer store
  (`app/src/store/store.ts`): `sourceNodes`, `childrenByParent`,
  `nodeOrder` give you hierarchy and sibling order.
- Note/folder creation must go through the existing actions in
  `app/src/actions/workspace.ts` (`createNote`, `createFolder`,
  `commitOperations`) so the Rust side persists them — never write to
  the store directly.
- Tauri command pattern: see `app/src-tauri/src/lib.rs` — thin
  `#[tauri::command]` fns, errors mapped to `String`, blocking work via
  `spawn_blocking`, registered in the invoke handler; frontend wrappers
  live in `app/src/bridge/commands.ts`.

## File-system access

File writing/reading happens on the Rust side (new Tauri commands, e.g.
`export_notes(entries: Vec<ExportEntry>, target_dir: String)` and
`read_markdown_tree(source_dir: String)`), so no fs capability needs to
be opened to the webview. For the directory picker: the repo has a
no-new-deps rule; the one sanctioned exception here is
`tauri-plugin-dialog` (Rust crate + `@tauri-apps/plugin-dialog`) if no
existing picker path exists — if you add it, register it in
`app/src-tauri/capabilities/default.json` and `tauri.conf.json`
correctly. Prefer a Rust-side `rfd`-free approach via the plugin; do
not hand-roll a path input field.

## Conventions (do not violate)

- Standalone functions = `function` declarations; callbacks = arrows.
- No explanatory comments; kebab-case filenames; tests in `__tests__/`.
- No empty catch blocks — use the `noop` helper under `app/src/shared/lib/`.
- Command palette actions follow the existing registry pattern in
  `app/src/commands/`.

## Definition of done

- Round-trip test in `app/__tests__/`: build a workspace fixture →
  export tree → import into a fresh store → titles, hierarchy, and
  markdown content match (references/mentions may degrade to plain
  text on import; assert they degrade, not crash).
- Filename sanitization + collision tests.
- `cd app && pnpm typecheck` exit 0; `pnpm test` all pass.
- `cargo clippy --workspace --all-targets` no warnings;
  `cargo fmt --check` clean; `cargo test --workspace` all pass.
- Manual check: export a workspace with nested folders + a note titled
  `a/b: test?`, confirm files land correctly; re-import them.
- Summarize what you built. Do not commit unless asked.
