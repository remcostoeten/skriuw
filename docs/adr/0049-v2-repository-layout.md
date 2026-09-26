# ADR-0049: Group the v2 repository by product boundary

- Status: accepted
- Date: 2026-09-21

## Context

The v2 product had accumulated top-level application, service, and shared TypeScript directories. They obscured ownership and made the root look unlike a conventional multi-product repository, while the Rust crates already had a clear flat workspace boundary.

## Decision

Group v2 directories by ownership:

- `apps/workspace/` contains the desktop and browser application, including `src-tauri/`.
- `apps/mobile/` contains the Expo mobile application.
- `apps/site/` contains the marketing site.
- `apps/sync/` contains the Cloudflare authentication and sync Worker.
- `packages/renderer-core/` and `packages/theme/` contain the shared TypeScript packages.
- `crates/` remains flat, and `contracts/`, `docs/`, and the `bin/` contributor commands remain at the repository root.
- `tools/` holds build and release infrastructure: `scripts/`, `oxlint/`, and `packaging/`.
- `__tests__/fixtures/` holds data files shared across products and languages.
- Package-manager repositories live in the `skriuw` organization: the Homebrew cask in `skriuw/homebrew-tap`, the Scoop manifest in `skriuw/scoop-bucket`, and the apt and dnf repositories in `skriuw/packages` (served at `skriuw.github.io/packages`); the root `tap_migrations.json` moves users of the old tap-by-URL there.

Amended 2026-09-26: the sync Worker moved from `services/sync/` to `apps/sync/`, and root `scripts/`, `packaging/`, and `fixtures/` moved under `tools/` and `__tests__/`.

The root Bun workspace includes the applications and packages. The sync service keeps its existing independent dependency installation boundary. Package names, application identifiers, public URLs, and deployment identities do not change.

## Consequences

Tooling resolves the new paths from the repository root. Cross-application code uses the existing `@skriuw/renderer-core` and `@skriuw/theme` package interfaces instead of reaching into package source trees. ADR-0022 remains the historical record of the v2 import but no longer describes the current filesystem layout.
