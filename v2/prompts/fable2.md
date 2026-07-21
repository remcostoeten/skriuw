# Lane 2 — Metadata + history sidebar, version preview and restore

You are working in `/home/remcostoeten/dev/skriuw-standalone` on the notes desktop app (`app/`). This is one of three parallel lanes; two other agents work on the command registry/palette (lane 1) and user settings (lane 3). Stay inside your scope and follow the append-only rule below so the lanes merge cleanly.

## Read first

1. `AGENTS.md`, `TODO.md` (section "MVP UI"), `docs/handoff.md`
2. `app/src/shell/metadata-panel.tsx` (version listing already ships — commit 32a4/`32c8`-era "list note versions in metadata sidebar")
3. `app/src/actions/workspace.ts`, `app/src/store/` (renderer store shape), `app/src/shell/editor-host.tsx`
4. Backend contracts: `docs/adr` entries on history (lazy Git history headers, Markdown version reads) and the settings/metadata slice notes in `TODO.md` ("P1: settings and metadata")

## Goal

Ship the two remaining MVP items this lane owns:

1. **Metadata and history sidebar (no people, no tags).** Complete the right panel: canonical note metadata (created/updated timestamps, word/char counts if derivable renderer-side, folder path) plus the version history list. All data comes from canonical node/document/history fields already in the hydrated store or already-fetched history headers — people, tags, properties, covers stay excluded per the settings/metadata ADR.
2. **Version preview and restore.** Selecting a version opens a read-only preview of that version's content; a restore action replaces the current note content with the selected version through the existing operation path (optimistic update, revision acknowledgement reconciles later). Markdown for a version loads lazily only when that version is opened — that is the one sanctioned async in this panel; it must never block navigation, and the panel must render instantly with headers while content loads. Restore must be undoable-safe: it goes through the normal document-save operation so it lands in history like any edit, not a special backend path.

## UI expectations

- Preview can reuse the read-only rendering approach from `app/src/shell/trash-view.tsx` (renders canonical ProseMirror JSON without Markdown parsing) where the formats align; for Git-history Markdown versions, parse with the existing prosemirror-markdown setup on open.
- Confirmation before restore (existing dialog primitive in `app/src/shared/ui/dialog.tsx`).
- Empty, loading (version content only), active, and error states with existing theme tokens; reduced-motion safe.
- Keyboard navigable version list.

## Scope and file boundaries

- Yours: `app/src/shell/metadata-panel.tsx`, new files under `app/src/shell/` or `app/src/history/` for version preview/restore, related store additions under `app/src/store/`.
- **Append-only** (other lanes touch these too): `app/src/app.tsx`, `app/src/app-route.ts`, `app/src/styles.css`, `app/src/shared/icons.tsx`. Add lines; do not reorder or rewrite existing blocks.
- Do not touch: `app/src/shortcuts/**`, `app/src/shared/ui/command-palette*` (lane 1), settings view files (lane 3). If restore should appear in the command palette, do not wire it yourself — note it in your final summary for lane-1 integration.
- Shortcuts, if any are needed: extend `SHORTCUT_DEFINITIONS` is lane 1's territory — for now use focus-local keys only inside your panel and list what global bindings you'd want.

## Conventions (enforced)

- Kebab-case filenames. Tests in `__tests__/` dirs mirroring source layout (repo root `app/__tests__/`).
- `type`, never `interface`. Single non-exported local type is named `Props`.
- Named `function` declarations for standalone functions; arrows only as callbacks.
- No explanatory comments; no new dependencies; plain CSS with existing theme tokens.
- Panel open/close and version-list rendering perform zero IPC/DB/Git/parse work; only opening a specific version's content may load.

## Verification before you finish

- `pnpm --dir app test`, typecheck, and production build pass.
- Pure model tests for version-list projection and restore-payload construction; store tests for any new store fields.
- `git diff --check` passes. Commit in logical order on this lane's branch. Update `TODO.md` checkboxes and `docs/handoff.md` only for your own items.
