# Task: Tailwind v4 + 1:1 visual port of the skriuw notes UI

## Context

You are working in `~/dev/skriuw-standalone`, branch `feat/instant-local-first-foundation`.
This repo is a Rust-core + Tauri 2 + React 19 + Vite rewrite of the notes system from the
old Next.js monorepo at `~/dev/skriuw` (the `apps/web` app). The Rust backend, renderer
store, actions, bridge, editor, sidebar tree, metadata panel, command palette, and
shortcuts already exist and work in `app/`. **Do not change any store, action, bridge, or
palette logic** — your job is purely visual: make the standalone app look 1:1 identical to
the original notes UI.

The original components are styled with Tailwind utility classes. The standalone currently
uses hand-written CSS in `app/src/styles.css` + `app/src/themes.css`. The approved plan is
to add Tailwind v4 so the original markup can be ported near-verbatim.

## Goal

1. **Add Tailwind v4** to `app/` (Vite plugin path: `tailwindcss` + `@tailwindcss/vite`,
   `@import "tailwindcss"` in the CSS entry). pnpm is the package manager.
2. **Port the original design tokens.** Source: `~/dev/skriuw/apps/web` theme CSS (look in
   `src/app/themes/*.css` and any global CSS defining variables like `--sidebar`,
   `--sidebar-border`, etc.). Map them into `@theme` / CSS variables inside
   `app/src/themes.css` so classes like `bg-sidebar` and `border-sidebar-border` resolve.
   Keep the existing theme-switching structure of `themes.css` (multiple named themes)
   working.
3. **Port these original components 1:1** (markup + classes), rewired to the standalone's
   data layer:
   - `~/dev/skriuw/apps/web/src/features/layout/components/icon-rail.tsx` → replace the
     icon rail JSX in `app/src/App.tsx`
   - `~/dev/skriuw/apps/web/src/features/notes/components/sidebar-panel.tsx` and
     `file-list.tsx` → restyle `app/src/shell/Sidebar.tsx` (keep ALL its behavior:
     keyboard nav, context menu, rename, trash section, focus/active states)
   - `~/dev/skriuw/apps/web/src/features/notes/components/editor-pane-host.tsx` and
     `notes-empty-state.tsx` → restyle `app/src/shell/EditorHost.tsx`
   - `~/dev/skriuw/apps/web/src/features/notes/components/metadata-panel.tsx` →
     restyle `app/src/shell/MetadataPanel.tsx` (keep the version-history list)
   - Panel toggles: `~/dev/skriuw/apps/web/src/shared/icons/panel-left-toggle.tsx` /
     `panel-right-toggle.tsx` — add collapsible sidebar + metadata panel with these
     toggles, matching the original's behavior.
4. **Command palette styling**: keep `app/src/shared/ui/CommandPalette.tsx` logic and
   class hooks as-is; you may restyle via the existing class names in CSS or swap
   `className` strings to Tailwind utilities, but do not touch its props, state, or the
   model file (`command-palette-model.ts`) — search wiring was just added there.

## Architecture rules (non-negotiable)

- All data flows through the existing renderer store (`app/src/store/`) via
  `useRendererSelector` and through `app/src/actions/workspace.ts`. Never call the bridge
  directly from components; never add component-local copies of workspace state.
- Ported components are presentational: take the `store` (or plain props) like the
  existing shell components do. Match the existing selector patterns in
  `app/src/shell/Sidebar.tsx`.
- Icons: inline SVG components in `app/src/shared/icons.tsx` (extend it; copy paths from
  the original's `src/shared/icons/`). No icon library.
- New reusable primitives go in `app/src/shared/ui/`.
- Drop original features that have no backend here: sharing, collaboration, AI, covers,
  tags, journal, tasks, people. If the original markup references them, omit those nodes.

## Code style (global rules for this user)

- Standalone functions: `function` declarations. Callbacks: arrow functions.
- No empty `catch` — use `noop` from `app/src/shared/lib/noop.ts` if intentionally
  swallowing.
- A file with a single non-exported type names it `Props`.
- No explanatory comments; comments only for workarounds or JSDoc on shared helpers.

## Verify

- `cd app && pnpm typecheck && pnpm test` must pass (19 tests currently green).
- `pnpm tauri:dev` should launch; visually compare against the original by running the
  old app if needed.
- Delete dead CSS from `styles.css` as components move to Tailwind utilities, but keep
  the palette/context-menu classes until those are migrated.

## Out of scope

Quick switcher/search (done separately), settings UI, drag-and-drop, version restore.
