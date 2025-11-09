# Repository Guidelines

This monorepo powers Skriuw, a local-first Tauri + Next.js notebook. Follow the practices below to keep the tooling predictable and the developer experience sharp.

## Project Structure & Module Organization
- `apps/web` holds the desktop/web client; all feature work lives under `src/`.
- `apps/docs` serves the Fumadocs documentation site; most content resides in `content/`.
- `tools/` contains SK (the CLI tool) and database seeding utilities.
- `plans/` tracks roadmap and product narratives; update summaries here, not in source folders.
- Static assets shared across apps live in `static-ui/`.

## Build, Test, and Development Commands
- `bun run cli` or the alias `bun run sk` opens SK, the interactive manager for dev, build, and deploy flows.
- `bun run dev` starts the Skriuw app directly on port 42069; use when debugging Next.js-specific issues.
- `bun run build` produces a Next.js production build; pair with `bun run tauri:build` inside `apps/web` for desktop bundles.
- `bun run lint` and `bun run format:check` enforce ESLint + Prettier rules before committing.

## Coding Style & Naming Conventions
- TypeScript everywhere; prefer named exports and pull shared utilities into `src/shared/` or `src/lib/`.
- Prettier enforces single quotes, 4-space indentation, and no semicolons; run `bun run format` to auto-fix.
- ESLint (Next.js config + custom rules) expects import blocks alphabetized by group and favors function declarations.
- React components use PascalCase files; hooks belong in `src/hooks/` and start with `use`.

## Testing Guidelines
- Automated tests are not in place yet; perform manual smoke passes via SK (app launch, note CRUD, sync flows).
- When adding tests, colocate them beside the source file with `.test.ts` naming and document required setup in `SHORTCUTS.md` until a test runner is standardized.

## Commit & Pull Request Guidelines
- Follow the existing conventional prefix format (`feat:`, `docs:`, `fix:`); keep subject lines under ~60 characters.
- Break large efforts into logical commits; include context in the body when touching multiple modules.
- Pull requests must describe the change, list manual verification steps, and link work items; attach screenshots or recordings when the UI changes.

## Configuration & Environment
- Copy `.env.example` to `.env` and set `NEXT_PUBLIC_INSTANT_APP_ID` before running the app.
- Never commit secrets; prefer OS keychains when pairing Tauri with platform-specific APIs.
- Regenerate desktop bundles only after bumping the app version and documenting the change in `plans/`.
