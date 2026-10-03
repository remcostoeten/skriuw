# ADR-0055: Workspace module boundaries

- Status: accepted
- Date: 2026-10-03

## Context

`apps/workspace/src` holds 23 feature folders next to `shell`, `commands`,
`store`, `bridge` (now `platform`), `contracts`, and `shared`. Nothing states what each folder
owns or which folder may import which. Features reach into each other's
subfolders, `commands` and `store/actions` implement feature behaviour, shared
code imports the shell, and features import each other in cycles. The workspace
module restructuring milestone (#442 to #463) moves code between these folders
and needs one set of rules to move it towards.

## Decision

### Layers

Every source file belongs to one module, and every module belongs to one layer.

| Layer | Folder today | Module | Owns |
| --- | --- | --- | --- |
| app | `main.tsx`, `app.tsx`, `app-route.ts`, `app/` | one | Startup, providers, routing, binding platform ports such as the browser sync session, and registering each module's commands. |
| shell | `shell/` | one | Application chrome and layout: panes, tabs, split view, title bar, window controls, the compact and mobile shell. No note, sync, or persistence behaviour. |
| feature | `features/<name>/` | one per folder | One user-facing capability, such as editor, journal, sync, or lock, including its UI, models, behaviour, and command definitions. |
| commands | `commands/` | one | Command infrastructure: registry, bindings, frecency, hints, and the palette UI. No feature behaviour. |
| store | `store/` | one | The renderer store: state shape, selectors, subscriptions, and genuinely global state. |
| platform | `platform/<name>/` | one per folder | Runtime adapters. `ports` holds contracts shared by the adapters, `browser` the storage worker, OPFS, sync driver, service worker, and files, `desktop` Tauri IPC and windows, and `runtime` runtime detection, adapter selection, and the typed command client. |
| shared | `shared/<name>/` | one per folder | Domain-neutral UI, hooks, icons, and helpers. |
| contracts | `contracts/` | one | Types shared across layers. |

### Dependency direction

A module may import from its own layer and the layers listed for it.

| Layer | May import |
| --- | --- |
| app | every layer |
| shell | feature, commands, store, platform, shared, contracts |
| feature | other features, commands, store, platform, shared, contracts |
| commands | store, platform, shared, contracts |
| store | platform, shared, contracts |
| platform | shared, contracts |
| shared | other shared modules, contracts |
| contracts | nothing |

Nothing imports app. Features import the command registry to define their
commands; app composes those definitions. Store may import platform because
renderer actions submit `WorkspaceOperation` messages through the bridge.

Modules must not form cycles. Because the layer order above has no cycles, a
cycle between modules either crosses a forbidden edge or stays inside the
feature or shared layer.

### Public API

The files directly in a module's root folder are its public API. Folders inside
a module are private to it. Another module may import `features/editor/note-editor.tsx`
but not `features/editor/vim/vim-motions.ts`. Inside a module, any file may import
any other file, across its folders.

There are no `index.ts` barrels. To expose something from a private folder,
either keep its file in the module root, or add a root file named after the
capability that re-exports only what other modules use, for example
`features/editor/markdown.ts` re-exporting from `features/editor/markdown/`.

`platform/runtime/runtime.ts` is the one place that detects whether the
renderer runs in the browser or the Tauri shell and routes each command to the
matching adapter. Detection stays in platform rather than app because modules
read it while they load, before startup runs. Inside platform, `runtime` may
import `browser`, `desktop`, and `ports`; `browser` and `desktop` import only
`ports`, so the adapters never ask which runtime they are in. Their callers do.

The same rule applies to the single-module layers. `store/actions/` is therefore
private to `store`; #448 dissolves it. Each `shared/<name>` and `platform/<name>`
folder is its own module, so `shared/icons/animated/` is private to `shared/icons`.

### Flat modules and capability folders

A module stays flat while it does one thing and every root file is meant for its
consumers. It introduces capability folders when it mixes several capabilities,
when file names start repeating a prefix (`annotation-*`, `vim-*`), or when it
has helpers other modules must not reach.

- Name a capability folder after what it does, such as `vim`, `markdown`, or
  `blocks`, never after a file kind such as `components`, `hooks`, or `utils`.
- Use one level of capability folders. Nest further only when a capability is
  itself several capabilities.
- Drop the prefix the folder already supplies: `annotations/menu.tsx`, not
  `annotations/annotation-menu.tsx`.
- Keep the module's composition files, such as `note-editor.tsx`, in the root.

### Enforcement

`__tests__/apps/workspace/src/module-boundaries.test.ts` scans `apps/workspace/src`
and runs in the `workspace` Vitest project, so the desktop gate runs it. It
reports four kinds of violation, one line each:

- `layer`: an import from a layer the importer may not use.
- `internal`: an import of a file inside another module's private folder.
- `module-cycle`: an allowed module edge that lies on a cycle between modules.
- `file-cycle`: a static value import that lies on a cycle between files.
  Type-only and dynamic imports cannot cause evaluation-order cycles and are
  left out of this check.

Static, type-only, side-effect, and dynamic imports, and `new URL(..., import.meta.url)`
worker entries, all count for `layer` and `internal`. Only `@/` and relative
specifiers are followed.

Existing violations are listed in
`__tests__/apps/workspace/src/module-boundaries.baseline.txt`. The test fails on
a violation missing from the baseline, and fails when the baseline lists a
violation that no longer exists. After removing violations, shrink the baseline
with:

```bash
bunx vitest run --project workspace -u __tests__/apps/workspace/src/module-boundaries.test.ts
```

`-u` cannot add lines, because the check for new violations runs first. Adding a
line by hand is an exception that a reviewer has to accept. When moving a file
that the baseline names, replace its lines in the same change instead of adding
new dependencies.

Oxlint's `import/no-cycle` has no baseline, and no Oxlint rule expresses layers
or private folders, so the check is a test with no new dependency.

## Consequences

- The baseline starts with 241 lines: 81 `layer`, 118 `internal`, 35
  `module-cycle`, and 7 `file-cycle`. The largest groups are features importing
  the shell, `commands/workspace-commands.tsx` importing features, modules
  importing `store/actions/`, and the cycle running through editor, settings,
  AI, and journal. The restructuring issues remove them, and each change shrinks
  the baseline.
- New code cannot add a layer violation, reach into another module's private
  folder, or close a cycle without editing the baseline.
- The scanner reads import statements with regular expressions. It relies on
  oxfmt putting each `import` and `export ... from` at the start of a line.
