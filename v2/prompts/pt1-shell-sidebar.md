# PT1: Tailwind 1:1 port — icon rail, sidebar/file-list, panel toggles

Run with a cheaper model (Sonnet is fine). PT2 (`prompts/pt2-editor-panels.md`) runs in
parallel in another session — stay strictly inside the files listed under "You own".

## Context

Repo: `~/dev/skriuw-standalone`, branch `feat/daddy-2`. This is a Rust-core + Tauri 2 +
React 19 + Vite rewrite of the notes app from the Next.js monorepo at `~/dev/skriuw`
(`apps/web`). Tailwind v4 is already installed and working: `@tailwindcss/vite` is in
`app/vite.config.ts`, `@import "tailwindcss"` + `@plugin "tailwindcss-animate"` are in
`app/src/styles.css`, and the full original `@theme` token map is in `app/src/themes.css`
— classes like `bg-sidebar`, `border-sidebar-border`, `text-muted-foreground` all resolve.
The context menu in `app/src/shell/sidebar.tsx` was already ported 1:1 (Radix) — do not
touch its logic, only the markup around it.

Reference for how a finished 1:1 port looks: `app/src/shared/ui/context-menu.tsx` vs the
original `~/dev/skriuw/apps/web/src/shared/ui/context-menu.tsx`.

## Goal — port these originals 1:1 (markup + Tailwind classes), rewired to the standalone data layer

1. **Icon rail**: `~/dev/skriuw/apps/web/src/features/layout/components/icon-rail.tsx`
   → replace the icon-rail JSX in `app/src/app.tsx`. Drop nav targets that have no
   backend here (journal, tasks, people, tags, sharing, AI); keep notes, search/palette,
   settings, theme-related items that exist in the standalone.
2. **Sidebar panel + file list**: `~/dev/skriuw/apps/web/src/features/notes/components/sidebar-panel.tsx`
   and `file-list.tsx` → restyle `app/src/shell/sidebar.tsx`. Keep ALL existing behavior:
   keyboard nav (`onTreeKeyDown`), the Radix context menu block, rename input, trash
   section, focus/active/hover states — swap hand-written CSS classes (`tree-row`,
   `sidebar-header`, …) for the original's Tailwind markup. Match row height, indent
   steps, folder chevrons/glyphs, typography exactly.
3. **Panel toggles**: `~/dev/skriuw/apps/web/src/shared/icons/panel-left-toggle.tsx` and
   `panel-right-toggle.tsx` → make the sidebar and metadata panel collapsible from
   `app/src/app.tsx`, matching the original's toggle placement and behavior. Persist
   collapsed state the same way other UI state is handled in the store/actions if a slot
   exists; otherwise plain `useState` in `app.tsx` is fine for now.

## You own (may edit)

- `app/src/app.tsx`, `app/src/shell/sidebar.tsx`
- `app/src/styles.css`: delete ONLY the CSS blocks for components you migrate
  (`.icon-rail*`, `.sidebar*`, `.tree-row*`, `.trash-row*`, `.tree-rename-input`).
  Touch nothing else in that file — PT2 owns the editor/metadata/palette blocks.
- `app/src/shared/icons.tsx`: append new icon components at the END of the file only
  (copy SVG paths from the original's `src/shared/icons/` or lucide). Never reorder or
  edit existing icons — PT2 appends here too.

## Do NOT touch

`app/src/shell/editor-host.tsx`, `metadata-panel.tsx` (except importing/placing the
toggle if unavoidable — prefer doing toggles entirely from `app.tsx`),
`command-palette*`, `app/src/store/**`, `app/src/actions/**`, `app/src/bridge/**`,
`app/src/shared/ui/context-menu.tsx`, `app/src/themes.css`, anything in `src-tauri/`.
Leave the uncommitted files `app/src/shell/trash-view.tsx` and
`app/src/actions/workspace.ts` exactly as they are (parallel work in progress).

## Rules

- Data flows only through the renderer store (`useRendererSelector`) and
  `app/src/actions/workspace.ts`, exactly as `sidebar.tsx` does today. No component-local
  copies of workspace state, no direct bridge calls.
- No new dependencies, no icon libraries — inline SVGs in `shared/icons.tsx`.
- Omit original markup for features with no backend (favorites, tags, sharing, journal,
  covers, multi-select, drag-and-drop, virtualization).
- Code style: standalone functions = `function` declarations; callbacks = arrows; no
  empty catch (use `noop` from `app/src/shared/lib/noop.ts`); single non-exported type
  per file is named `Props`; no explanatory comments.
- File names kebab-case; tests live in `app/src/__tests__/`.

## Verify

`cd app && pnpm typecheck && pnpm test && pnpm build` must all pass (31 tests currently
green). Do NOT commit — leave changes in the working tree.
