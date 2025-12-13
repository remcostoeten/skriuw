# Repository Guidelines

## Project Structure & Modules
- `apps/web`: Next.js app; UI, routes, and feature folders (e.g., `features/notes`, `features/settings`).
- `packages`: Shared libraries—`crud` (data helpers + Vitest tests), `db` (Drizzle schema/config), `ui` (design system), `core-logic` (business rules), `shared` (types/utils), `env`, and config packages.
- `docs`, `seeds`, `tools`, `bin`: Reference material, seed data, utility scripts (e.g., `tools/check-db.ts`), and CLIs (e.g., `bin/db-cli`).
- Root configs: `turbo.json`, `tsconfig.json`, `.prettierrc`, `eslint.config.js`, `vercel.json`.

## Build, Test, and Development
- Install: `bun install` (uses Bun workspaces).
- Dev server: `bun run dev` (runs `tools/check-db.ts`, then Turbo-driven dev).
- Build: `bun run build` (Turbo builds all packages/apps).
- Lint: `bun run lint`; Fix + format: `bun run format`.
- Types: `bun run check-types`.
- Tests: `bun run test` (Turbo; `test` depends on `build` per `turbo.json`).
- Full gate: `bun run validate` (lint + types + test + build).
- Database helpers: `bun run db <cmd>` (wrapping `bin/db-cli`, Drizzle config in `drizzle.config.ts`).

## Coding Style & Naming
- Languages: TypeScript + React. Strict TS via `tsconfig.json`.
- Prettier: Root uses 4-space indent, no semicolons, single quotes, width 80; `apps/web` overrides to 2 spaces, width 100, trailing commas `es5`.
- ESLint: Unused imports are errors; import order enforced (`builtin` → `external` → `internal` alias groups). Hooks rules on; console allowed for warn/error only.
- Naming: Use descriptive camelCase for vars/functions, PascalCase for components/types, kebab-case for files/routes in Next.js.

## Testing Guidelines
- Framework: Vitest. Tests live near sources (`*.test.ts`/`*.test.tsx`) in `packages/crud` and `apps/web/features/**`.
- Run locally with `bun run test`; watch mode inside packages with `bun run --filter crud test:watch` if needed.
- Keep tests deterministic; prefer unit-level mocks and avoid network I/O.

## Commit & PR Guidelines
- Commit history favors concise, imperative titles with lowercase type prefixes (e.g., `fix: ...`, `refactor: ...`); follow that pattern.
- Before opening a PR, run `bun run validate` and resolve lint/type warnings.
- PRs should include: clear summary, linked issue (if any), and screenshots/GIFs for UI changes; call out migration or env impacts.
- Keep changes scoped; mention new scripts/env vars in the description.
