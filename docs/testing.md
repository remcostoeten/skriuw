# TypeScript testing

This covers the v2 TypeScript suites for `apps/` and `packages/`.
Rust tests run through `cargo test` inside `bin/check`. The frozen v1 tree still
uses `bun:test` and is out of scope.

## Runner

Every suite runs on Vitest 4. The root `vitest.config.ts` defines one project
per package:

| Project | Suites | Gate |
| --- | --- | --- |
| `workspace` | `__tests__/apps/workspace/{src,performance}` | desktop, with coverage |
| `renderer-core` | `__tests__/packages/renderer-core` | desktop, with coverage |
| `ui-architecture` | `__tests__/apps/workspace/harnesses/ui-architecture` | desktop |
| `renderer-store` | `__tests__/apps/workspace/harnesses/renderer-store` | desktop |
| `icons` | `__tests__/packages/icons` | desktop, mobile |
| `theme` | `__tests__/packages/theme` | desktop, mobile |
| `mobile` | `__tests__/apps/mobile` | mobile |
| `shared` | `__tests__/packages/shared` | desktop |

`apps/sync` is installed separately and runs its suites inside workerd
through `@cloudflare/vitest-pool-workers`. It keeps its own Vitest install and
`apps/sync/vitest.config.ts`, which reads `__tests__/apps/sync`.

```bash
bun run test                                  # every project in vitest.config.ts
bunx vitest run --project mobile              # one project
bunx vitest run __tests__/apps/mobile/src/features/lock
bun --cwd apps/workspace run test             # workspace + renderer-core + shared, with coverage and the file report
bun --cwd apps/sync run test              # Worker suites
```

Each package's `test` script delegates to its project, so `bun --cwd <package>
run test` keeps working.

## Layout

A suite lives under `__tests__/` at the repository path of the code it covers,
with `.test.ts` appended to the file name:

```text
apps/mobile/src/features/lock/lock-model.ts
__tests__/apps/mobile/src/features/lock/lock-model.test.ts
```

Helpers and fixtures sit next to the suites that use them. Data files read by
more than one product or language (archive goldens, import samples, the demo
vault) live in `__tests__/fixtures/`. Code shared across products lives in
`__tests__/support/`:

- `paths.ts` provides `repositoryPath(...)` for suites that read repository
  files. Use it instead of paths relative to the suite.
- `resolve-from-owner.ts` is the Vite plugin that resolves bare imports from
  the owning package. Bun installs each workspace's dependencies into that
  workspace's own `node_modules`. Without this plugin, a suite under
  `__tests__/` could not find `react` or `@skriuw/*`.

Use the owning app's `@/` alias to import its source from a workspace or mobile
suite, and use relative paths everywhere else.

`tools/scripts/check-test-layout.sh` runs in both gates. It fails when a suite sits
outside `__tests__/`, or when no project collects a suite under `__tests__/`.
When you add a new package, add its project to `vitest.config.ts`.

## Conventions

- Import `test` (and `describe`/`expect`/`vi` as needed) from `vitest`. The
  suites migrated from `node:test` use `node:assert/strict`. Either style
  passes, but keep one style within a file.
- Suites run in Node. Workspace suites that need browser or Tauri globals
  install them with `__tests__/apps/workspace/src/shared/dom-stub.ts` and
  `tauri-stub.ts`.
- The mobile project aliases `react-native` and
  `react-native-safe-area-context` to
  `__tests__/apps/mobile/src/shell/react-native-stub.ts`. Suites that render
  shell components replace provider-bound modules with `vi.mock`; see
  `native-host.ts`.

## Type checking

Suites for mobile, icons, and sync are type-checked through tsconfigs under
`__tests__/`. These are run by each package's `typecheck` or `verify` script.
`__tests__/support/tsconfig.json` checks the shared support code and both
Vitest configs, and runs as part of the workspace `typecheck`. The workspace,
renderer-core, harness, and theme suites are not type-checked. They were not
type-checked before this migration either.
