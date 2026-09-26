# Repository instructions

These instructions apply to the entire Skriuw repository. Read the nearest product documentation before changing code, and treat existing architecture decisions as constraints unless the change explicitly supersedes them.

## Repository map

Skriuw contains two independent product lines:

- The repository root is the current (v2) local-first desktop application. Its stack is Rust, React, ProseMirror, SQLite, and Tauri.
- `apps/` contains the v2 workspace application, mobile application, marketing site, and documentation site; `services/` contains the v2 sync service; `packages/` contains shared TypeScript packages; and `crates/` remains the flat Rust workspace.
- `v1/` contains the frozen legacy v1 web, mobile, desktop, collaboration, and self-hosted products.
- `apps/docs/` is the documentation site (docs.skriuw.com). `apps/docs/content/v2/` holds the v2 docs, ADRs, specs, and benchmarks; `apps/docs/content/v1/` holds the frozen v1 docs.

The default branch is `daddy`. `master` is not the primary integration branch.

## Before editing

1. Inspect `git status --short` and preserve unrelated changes.
2. Identify whether the task affects v1, v2, shared infrastructure, or documentation.
3. Read the product's README and relevant architecture material:
    - v2: `README.md`, `apps/docs/content/v2/features.md`, `apps/docs/content/v2/architecture.md`, and applicable files in `apps/docs/content/v2/adr/`.
    - v1: the relevant guide under `apps/docs/content/v1/` and any instructions generated in `v1/apps/web/AGENTS.md`.
4. Search for existing contracts, tests, and conventions before introducing a new module or dependency.

Do not implement from a stale task plan when the repository provides newer code, tests, or architecture decisions.

## Engineering principles

- Keep changes focused and preserve established product behavior outside the requested scope.
- Prefer a small, explicit module over a broad abstraction. Add a seam only when it has a concrete adapter, test, or portability requirement.
- Keep product rules independent from frameworks, storage engines, and operating-system details.
- Validate at trust boundaries. Return actionable errors instead of silently discarding failures.
- Avoid speculative dependencies, generic wrappers, pass-through helpers, and duplicated sources of truth.
- Treat accessibility, keyboard operation, recovery, and performance as product behavior.
- Put durable reasoning in architecture documentation or an ADR. Comments should explain constraints that the code cannot express.
- Never commit credentials, local databases, workspace exports, personal notes, generated reports, build output, or temporary plans.

## v2 architecture

- SQLite is canonical storage.
- Renderer actions update local state synchronously, then submit versioned `WorkspaceOperation` messages.
- Navigation after startup must not wait for disk, IPC, network, parsing, Git, or lazy loading.
- The Rust domain layer must remain free from database, filesystem, framework, and operating-system dependencies.
- Backend capabilities are narrow use-case traits, not table-shaped CRUD interfaces.
- Durable writes remain serialized and transactional.
- Git history and rebuildable projections stay off editing and navigation paths.
- Recovery-relevant failures must remain visible and testable.
- Generated Rust/TypeScript contracts are committed and drift-checked.

Read `apps/docs/content/v2/performance-contract.md` before changing navigation, editor, store subscription, or rendering behavior.

## TypeScript and React

- Follow the types and naming patterns in the owning product line.
- Prefer named function declarations for components and standalone operations; use arrow functions for callbacks.
- Derive values during render instead of synchronizing derived state with effects.
- Keep subscriptions as narrow as the values rendered.
- Do not create components inside render functions.
- Keep transient editor and interaction state out of broad React context.
- Import from the owning module instead of introducing new barrel exports.
- Cover behavior through public user or domain interfaces, not implementation details.
- Put v2 TypeScript suites at `__tests__/<path of the code they cover>` and write them for Vitest; see `apps/docs/content/v2/testing.md`.

## Rust and persistence

- Preserve dependency direction from domain to adapters.
- Keep transactions atomic and migrations forward-safe.
- Test conflicts, partial failures, recovery, and restart behavior for persistence changes.
- Do not weaken archive validation, backup verification, path safety, or bounded diagnostics.
- Avoid blocking renderer or runtime threads with filesystem, Git, or database work.

## Documentation

- Link to canonical documentation instead of copying it.
- Put v2 architecture decisions in `apps/docs/content/v2/adr/`, implementation contracts in `apps/docs/content/v2/specs/`, and measurements in `apps/docs/content/v2/benchmarks/`.
- Put user guides in `apps/docs/content/v2/` and list new pages in the folder's `meta.json`. Every page needs a `title` in frontmatter. `apps/docs/content/v1/` is frozen.
- Do not commit agent handoffs, implementation prompts, generated audits, or temporary planning documents.
- Update `README.md`, `CONTRIBUTING.md`, and affected guides when commands or contributor workflows change.

## Verification

Run the smallest relevant checks while iterating, followed by the product-level gate before handoff.

For v2:

```bash
./bin/check
```

Run `bun run --cwd apps/docs build` for documentation navigation, frontmatter, or MDX changes. Generate changed contracts with `bin/generate`. Performance-sensitive changes require representative measurements against `apps/docs/content/v2/performance-contract.md`.

For v1:

```bash
cd v1
bun lint
bun typecheck
bun test
```

Run `bun run build` from `v1/` when changing production configuration, routing, or shared build behavior.

Every handoff must state what changed, which checks ran, and any remaining risk. Do not claim tests passed unless they were executed successfully.
