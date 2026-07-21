# Lane 1 — Central command registry, command palette, keyboard-first navigation

You are working in `/home/remcostoeten/dev/skriuw-standalone` on the notes desktop app (`app/`). This is one of three parallel lanes; two other agents work on the metadata/history panel (lane 2) and user settings (lane 3). Stay inside your scope and follow the append-only rule below so the lanes merge cleanly.

## Read first

1. `AGENTS.md`, `TODO.md` (section "MVP UI"), `docs/handoff.md`
2. `app/src/shortcuts/definitions.ts`, `app/src/shortcuts/workspace-shortcuts.tsx`, `app/src/shortcuts/bindings.ts`
3. `app/src/shared/ui/command-palette-model.ts`, `app/src/shared/ui/command-palette.tsx`
4. `app/src/actions/workspace.ts`, `app/src/app.tsx`, `app/src/app-route.ts`

## Goal

Ship the two remaining MVP items this lane owns:

1. **Central command registry.** One typed registry that is the single source of truth for every user-invokable command: id, label, group, optional shortcut binding, enabled/visible predicate against the renderer store, and action. The command palette, keyboard shortcuts, and (where practical) context menus must all consume registry entries instead of defining their own ad-hoc actions. Migrate the existing `SHORTCUT_DEFINITIONS` actions and the palette's current items into it.
2. **Keyboard-first navigation.** Full keyboard reachability for the shell: focus movement between icon rail, sidebar tree, editor, and metadata panel; sidebar tree navigation already partially exists — complete gaps (jump to editor, back to sidebar, open palette from anywhere, route switching). Every new binding is a registry command with a shortcut, not a loose handler.

## Shortcuts: hard rule

**Do not build custom keyboard handling.** `@remcostoeten/use-shortcut` (already a dependency, already wired in `workspace-shortcuts.tsx`) covers scoped bindings, modifier combos, input/editor guards, and overrides. To add a shortcut: add a definition (extend `ShortcutActionId` + `SHORTCUT_DEFINITIONS`), wire its action through the registry, and let the existing `useShortcut` plumbing pick it up. No new `window.addEventListener("keydown", …)` outside what the package provides. The only exception is component-local keys inside an open overlay (palette list navigation already handles this). Keep the existing `worksWhileTyping` semantics and the settings-backed override path in `bindings.ts` intact.

## Scope and file boundaries

- Yours: `app/src/shortcuts/**`, `app/src/shared/ui/command-palette*`, new files under `app/src/commands/` (suggested home for the registry), focus-navigation glue.
- **Append-only** (other lanes touch these too): `app/src/app.tsx`, `app/src/app-route.ts`, `app/src/styles.css`, `app/src/shared/icons.tsx`. Add lines; do not reorder or rewrite existing blocks.
- Do not touch: `app/src/shell/metadata-panel.tsx` (lane 2), settings view files (lane 3). If a lane-3 or lane-2 feature needs a command, register a stub entry with a `TODO(lane-N)` label-only action and note it in your final summary.

## Conventions (enforced)

- Kebab-case filenames. Tests in `__tests__/` dirs mirroring source layout (repo root `app/__tests__/`).
- `type`, never `interface`. Single non-exported local type is named `Props`.
- Named `function` declarations for standalone functions; arrows only as callbacks.
- No explanatory comments; no new dependencies; plain CSS with existing theme tokens.
- No IPC, DB, Git, or lazy loading in navigation or palette-open paths — everything reads the hydrated renderer store.

## Verification before you finish

- `pnpm --dir app test`, typecheck, and production build pass.
- New registry behavior has model-level tests (pure, no DOM needed — follow `command-palette-model.test.ts` style): registration, enabled/visible predicates, shortcut lookup, palette projection.
- `git diff --check` passes. Commit in logical order on this lane's branch. Update `TODO.md` checkboxes and `docs/handoff.md` only for your own items.
