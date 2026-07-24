# Prompt: Image support in the note editor

Add images to the skriuw editor
(/home/remcostoeten/dev/skriuw-standalone). Work end-to-end without
asking for permission. Paste-an-image must just work; that is the bar.

## Scope

1. **Schema**: add an `image` node to `productSchema` in
   `app/src/editor/schema.ts` (attrs: `src`, `alt`; block-level or
   inline — match what `prosemirror-markdown`'s default image spec
   expects so serialization stays clean). Extend
   `serializeProductMarkdown` and the markdown parser config so images
   round-trip as `![alt](src)`.
2. **Ingestion paths**, all three:
   - paste an image from the clipboard into the editor,
   - drag-and-drop an image file onto the editor,
   - a `/image` slash command (file picker) — extend
     `app/src/editor/slash-commands.ts`.
3. **Storage**: images are files on disk, NOT base64 in the document
   JSON (base64 would bloat every save, history version, and the
   SQLite row). Add a Tauri command (pattern:
   `app/src-tauri/src/lib.rs` — thin command, `String` errors,
   `spawn_blocking`) that writes the bytes to an `attachments/`
   directory next to the database (see `database_path()` there),
   content-addressed (hash of bytes + original extension) so
   duplicates dedupe and renames never break references. Return the
   stored filename.
4. **Rendering**: the webview cannot load arbitrary `file://` paths.
   Use Tauri's asset protocol (`convertFileSrc` from
   `@tauri-apps/api/core`) and enable the asset protocol scope for the
   attachments directory in `app/src-tauri/tauri.conf.json` +
   `capabilities/default.json` — scope it to that one directory, not
   the whole filesystem. Store the bare filename in the node's `src`
   attr and resolve to a displayable URL in the node view, so
   documents stay portable.
5. **NodeView**: render via a ProseMirror node view (existing pattern:
   `app/src/references/reference-nodeview.ts`), selectable, `alt`
   editable via a small overlay or selection toolbar; broken/missing
   file shows a placeholder, never a broken-image glyph. Add minimal
   styles in `app/src/css/editor.css` (plain CSS, match existing
   tokens; max-width 100%, sensible max-height).
6. **Lifecycle**: deleting a note does NOT immediately delete its
   images (history versions may still reference them). Add orphan
   sweep to the existing maintenance layer
   (`app/src-tauri/src/maintenance.rs`): an attachment is orphaned
   only if no live document and no history version references its
   filename. Follow that file's existing report/command patterns.

## Constraints

- Bounded-editor compatibility: large notes go through
  `app/src/editor/bounded-document.ts`; make sure image blocks count
  as top-level blocks correctly and don't break windowing math.
- Export/import: if the export feature (export.md prompt) has landed,
  workspace export must copy referenced attachments into an
  `attachments/` folder beside the exported markdown and rewrite srcs
  relatively; if it hasn't landed, leave a clean seam.
- Conventions: `function` declarations for standalone fns, arrow
  callbacks, kebab-case files, no explanatory comments, no empty
  catches (`noop` from `app/src/shared/lib/`), tests in `__tests__/`,
  no new npm/cargo dependencies (image hashing: use a std/`rusqlite`-
  adjacent existing crate in the workspace or std hashing — check
  Cargo.lock before adding anything).

## Definition of done

- Tests: schema round-trip (JSON ↔ markdown with images), word count
  unaffected by images, content-addressing dedupes identical bytes,
  orphan sweep keeps history-referenced files.
- `cd app && pnpm typecheck` exit 0; `pnpm test` all pass;
  `cargo clippy --workspace --all-targets` clean; `cargo fmt --check`
  clean; `cargo test --workspace` all pass.
- Manual check in the running app (`pnpm tauri:dev`): paste a
  screenshot, drop a PNG, insert via `/image`; restart the app and
  confirm images still render; check a note with 300+ blocks plus
  images scrolls correctly (bounded editor).
- Summarize what you built. Do not commit unless asked.
