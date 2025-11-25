# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the runtime code: UI entry in `App.tsx`, feature slices under `src/features`, shared primitives in `src/shared`, API hooks in `src/api`, and styling tokens in `src/styles`. Persistent models live in `src/db`, while generated SQL artifacts are written to `drizzle/`. Ship assets (fonts, icons, static data) belong in `public/`, and build output is emitted to `dist/`. Documentation and RFCs go under `docs/` to keep non-code assets out of the app bundle.

## Build, Test, and Development Commands
- `pnpm dev` – start Vite with hot reload against the default SQLite bundle.
- `pnpm build` – run the production Vite build; inspect `dist/` before publishing.
- `pnpm test` – execute Vitest suites in watchless CI mode.
- `pnpm lint` / `pnpm lint:fix` – run ESLint with the shared React/TS rules; the fix variant applies safe autofixes.
- `pnpm typecheck` – confirm the project compiles under `tsconfig.json`.
- `pnpm drizzle:generate:web` and `pnpm drizzle:migrate:web` (or the desktop/libsql/sqlite variants) – regenerate schemas and push migrations for the selected target by setting `DRIZZLE_TARGET`.

## Coding Style & Naming Conventions
Use TypeScript everywhere and default to 2-space indentation with semicolons omitted, matching the Prettier defaults (`pnpm format.fix`). Component files should be PascalCase (`ProfileCard.tsx`), hooks use `use`-prefixed camelCase, and utility modules stay kebab-case (`string-utils.ts`). Keep imports sorted by group as enforced by ESLint’s `import/order`; leverage the `@/` alias to reference paths from `src/`. Prefer functional React components, React Hooks, and explicit prop types via interfaces.

## Testing Guidelines
Vitest powers all unit and integration tests. Co-locate specs beside the code they cover using `*.test.ts` or `*.test.tsx` naming, and mirror the module name (`Form.test.tsx` for `Form.tsx`). Use React Testing Library helpers for component behavior and mock Drizzle calls with lightweight fixtures. Every new feature should include happy-path and failure-path coverage; aim for meaningful assertions rather than raw coverage percentages. Run `pnpm test` locally before committing.

## Commit & Pull Request Guidelines
Follow the lightweight conventional style found in history (`docs: add some ai rules`): `<type>: <short summary>` where `type` is `feat`, `fix`, `chore`, `docs`, etc. Keep commits focused on one logical change and include database migrations or regenerated assets in the same commit when they are required by the code. Pull requests should describe the motivation, list test commands you ran, reference related issues, and attach screenshots or recordings for UI updates. For schema adjustments, note which `drizzle:*` command was executed and where the resulting files live so reviewers can reproduce the state.
