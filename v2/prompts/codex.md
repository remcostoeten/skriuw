# Lane 3 — User settings view

You are working in `/home/remcostoeten/dev/skriuw-standalone` on the notes desktop app (`app/`). This is one of three parallel lanes; two other agents work on the command registry/palette (lane 1) and the metadata/history panel (lane 2). Stay inside your scope and follow the append-only rule below so the lanes merge cleanly. You have no subagents — do everything yourself, sequentially.

## Read first

1. `AGENTS.md`, `TODO.md` (sections "MVP UI" and "P1: settings and metadata"), `docs/handoff.md`
2. `app/src/actions/settings.ts` and `app/src/shared/ui/shortcut-recorder.tsx` — settings plumbing and a shortcut-rebinding widget already exist. **Audit what exists before writing anything**; your job is to complete the settings surface, not duplicate it.
3. `app/src/shortcuts/bindings.ts` (settings-backed shortcut overrides), `app/src/store/` (renderer store), `app/src/app-route.ts`
4. The versioned settings contract: one typed version-1 document, explicit defaults, unknown fields preserved losslessly through load/save/export/import. Never drop fields you don't recognize.

## Goal

Ship the remaining MVP item this lane owns: **User settings** — a dedicated settings view (route or modal, follow whatever pattern `openSettings` already targets) that reads the hydrated settings document from the renderer store and writes changes through the existing settings action/operation path (whole-document update, optimistic, revision acknowledged later).

Sections to cover, driven by what the version-1 settings document actually contains (verify against the domain schema in `generated/contracts` — do not invent fields):

- Appearance/theme options that exist in the document.
- Editor preferences that exist in the document.
- Shortcut overrides — integrate the existing `shortcut-recorder` component; list every entry from `SHORTCUT_DEFINITIONS` with its effective binding, allow rebind and reset-to-default via the existing `bindings.ts` override mechanism.
- Anything else already present in the settings document; unknown/extension fields are preserved untouched, never rendered as editable.

## Hard rules

- **No custom keyboard handling.** `@remcostoeten/use-shortcut` is already wired; the `openSettings` binding exists. Component-local keys (Escape to close, arrows within your own lists) only.
- Opening settings performs zero IPC/DB/Git/lazy-load work — it reads the hydrated store. Saves go through the existing action; never write a new persistence path.
- Whole-document settings updates: read current document, apply the changed field, submit the full document. Never send partials.

## Scope and file boundaries

- Yours: new files under `app/src/shell/` or `app/src/settings/` for the view, `app/src/actions/settings.ts` extensions, related store additions.
- **Append-only** (other lanes touch these too): `app/src/app.tsx`, `app/src/app-route.ts`, `app/src/styles.css`, `app/src/shared/icons.tsx`. Add lines; do not reorder or rewrite existing blocks.
- Do not touch: `app/src/shortcuts/definitions.ts`, `app/src/shared/ui/command-palette*` (lane 1), `app/src/shell/metadata-panel.tsx` (lane 2). If settings should appear as palette commands, note it in your final summary for lane-1 integration instead of wiring it.

## Conventions (enforced)

- Kebab-case filenames. Tests in `__tests__/` dirs mirroring source layout (repo root `app/__tests__/`).
- `type`, never `interface`. Single non-exported local type is named `Props`.
- Named `function` declarations for standalone functions; arrow functions only as callbacks.
- No explanatory comments; no new dependencies; plain CSS with existing theme tokens; reduced-motion safe.

## Verification before you finish

- `pnpm --dir app test`, typecheck, and production build pass.
- Pure tests for settings-view model logic: default projection, changed-field document construction, unknown-field preservation, override reset.
- `git diff --check` passes. Commit in logical order on this lane's branch. Update `TODO.md` checkboxes and `docs/handoff.md` only for your own items.
