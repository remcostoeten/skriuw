# PT2: Tailwind 1:1 port — editor pane, empty state, metadata panel, command palette skin

Run with a cheaper model (Sonnet is fine). PT1 (`prompts/pt1-shell-sidebar.md`) runs in
parallel in another session — stay strictly inside the files listed under "You own".

## Context

Repo: `~/dev/skriuw-standalone`, branch `feat/daddy-2`. This is a Rust-core + Tauri 2 +
React 19 + Vite rewrite of the notes app from the Next.js monorepo at `~/dev/skriuw`
(`apps/web`). Tailwind v4 is already installed and working: `@tailwindcss/vite` is in
`app/vite.config.ts`, `@import "tailwindcss"` + `@plugin "tailwindcss-animate"` are in
`app/src/styles.css`, and the full original `@theme` token map is in `app/src/themes.css`
— classes like `bg-popover`, `text-muted-foreground`, `border-border` all resolve.

Reference for how a finished 1:1 port looks: `app/src/shared/ui/context-menu.tsx` vs the
original `~/dev/skriuw/apps/web/src/shared/ui/context-menu.tsx`.

## Goal — port these originals 1:1 (markup + Tailwind classes), rewired to the standalone data layer

1. **Editor pane + empty state**:
   `~/dev/skriuw/apps/web/src/features/notes/components/editor-pane-host.tsx` and
   `notes-empty-state.tsx` → restyle `app/src/shell/editor-host.tsx`. Keep the existing
   ProseMirror mounting and store wiring untouched — this is purely the chrome around it
   (padding, max-width, empty-state visuals/typography).
2. **Metadata panel**:
   `~/dev/skriuw/apps/web/src/features/notes/components/metadata-panel.tsx` → restyle
   `app/src/shell/metadata-panel.tsx`. Keep the version-history list and all its data
   wiring; match the original's section headers, spacing, and typography. Omit sections
   with no backend here (tags, sharing, covers, collaborators).
3. **Command palette skin**: keep `app/src/shared/ui/command-palette.tsx` props, state,
   and `command-palette-model.ts` 100% untouched (search wiring is fresh). You may only
   swap `className` strings in the palette JSX to Tailwind utilities, or restyle its
   existing class names inside your own CSS section. Match the original palette look
   (`~/dev/skriuw/apps/web` — search for its command palette / quick switcher component).
   If the risk of breaking it feels high, style via the existing class names in CSS only.

## You own (may edit)

- `app/src/shell/editor-host.tsx`, `app/src/shell/metadata-panel.tsx`,
  `app/src/shared/ui/command-palette.tsx` (classNames only)
- `app/src/styles.css`: delete ONLY the CSS blocks for components you migrate
  (`.editor-pane`, `.editor-empty`, `.editor-host`, `.metadata-*`, palette classes).
  Keep the `.prosemirror-host` blocks (typography inside the editor stays CSS).
  Touch nothing else — PT1 owns the icon-rail/sidebar/tree blocks.
- `app/src/shared/icons.tsx`: append new icon components at the END of the file only
  (copy SVG paths from the original's `src/shared/icons/` or lucide). Never reorder or
  edit existing icons — PT1 appends here too.

## Do NOT touch

`app/src/app.tsx`, `app/src/shell/sidebar.tsx`, `app/src/shell/command-palette-host.tsx`,
`app/src/shared/ui/command-palette-model.ts`, `app/src/shared/ui/context-menu.tsx`,
`app/src/editor/**` logic, `app/src/store/**`, `app/src/actions/**`, `app/src/bridge/**`,
`app/src/themes.css`, anything in `src-tauri/`. Leave the uncommitted files
`app/src/shell/trash-view.tsx` and `app/src/actions/workspace.ts` exactly as they are
(parallel work in progress).

## Rules

- Data flows only through the renderer store (`useRendererSelector`) and
  `app/src/actions/workspace.ts`. No component-local copies of workspace state, no direct
  bridge calls.
- No new dependencies, no icon libraries — inline SVGs in `shared/icons.tsx`.
- Omit original markup for features with no backend (tags, sharing, AI, covers,
  collaboration, journal).
- Code style: standalone functions = `function` declarations; callbacks = arrows; no
  empty catch (use `noop` from `app/src/shared/lib/noop.ts`); single non-exported type
  per file is named `Props`; no explanatory comments.
- File names kebab-case; tests live in `app/src/__tests__/`.

## Verify

`cd app && pnpm typecheck && pnpm test && pnpm build` must all pass (31 tests currently
green). Do NOT commit — leave changes in the working tree.
