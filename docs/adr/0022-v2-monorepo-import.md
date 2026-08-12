# ADR-0022: Import into the Skriuw monorepo as the v2 line

- Status: accepted
- Date: 2026-07-25

## Context

This codebase started life as `remcostoeten/skriuw-standalone`: a ground-up rebuild of [Skriuw](https://github.com/remcostoeten/skriuw), re-architected for performance from the first commit. The original Skriuw is a bun monorepo (`apps/web|mobile|desktop|extension|documentation` plus shared `packages/`) with cloud support and a broader feature surface; it stays available and maintained as the **v1** line. The rebuild is the **v2** line and the primary focus of development going forward.

Two repositories for one product create friction: split issue trackers, split release pages, and a provenance story that has to be re-explained everywhere. Development happens in one place, so the code should too. The original repository already runs multiple release lines from one repo via tag prefixes (plain `v0.x` for the product, `desktop-v*` for the v1 desktop app), which is the precedent this decision extends.

## Decision

### Top-level `v2/`, not `apps/desktop-v2/`

The rebuild is not an app inside v1's workspace — it is a self-contained product: its own Cargo workspace (`crates/`, `xtask/`, root `Cargo.toml`), its own lockfiles, and scripts that resolve paths from its own root. It is imported wholesale as a top-level `v2/` directory, a sibling of `apps/`. Placing it under `apps/` would pull its `package.json` into v1's bun workspace globs (`apps/*`) and entangle hoisting, lockfiles, and tooling that were deliberately kept independent. As a top-level directory, both toolchains stay isolated and everything under `v2/` works unchanged.

### History-preserving import

The standalone history is rewritten with `git filter-repo --to-subdirectory-filter v2` and merged into the monorepo with `--allow-unrelated-histories`. Every commit of the rebuild remains reachable and correctly pathed; nothing is squashed.

### Three release lines, differentiated by tag prefix

- `v0.x` — the v1 product line (web and companions), unchanged.
- `desktop-v*` — the v1 desktop app, unchanged.
- `v2-v*` — this line, continuing its own semver (next: `v2-v0.2.0`).

Both lines develop on the default branch; no branch split. CI is duplicated rather than merged: the v1 workflow ignores `v2/**`, and a ported `ci-v2.yml`/`release-v2.yml` pair runs only for `v2/**` paths and `v2-v*` tags.

### Updater and app identity

- The v2 updater endpoint moves to `remcostoeten/skriuw/releases/latest/download/latest.json`. The v1 desktop app ships empty updater endpoints, so there is no collision; if a non-v2 release must be published after a v2 release, it is published with `--latest=false` so the endpoint keeps resolving.
- The v2 bundle identifier stays distinct from v1 desktop's so both apps install side by side.
- The updater signing keypair rotated on 2026-07-24 carries over unchanged; the `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` secrets are duplicated to the monorepo.

### The standalone repository

`remcostoeten/skriuw-standalone` is retired after the import lands: README pointer to the monorepo, then archived. Its `v0.1.0` release remains downloadable; installs from it will not auto-update across the repo move, which is acceptable at `0.x`.

## Consequences

- One repository, one issue tracker, one releases page for both product lines.
- `git log -- v2/` tells the whole story of the rebuild from its first commit.
- The v2 line keeps its own versioning until it earns a stable number; nothing about v1's release cadence changes.
- Contributors must know that `v2/` is a separate toolchain: bootstrap and build from `v2/`, not the repo root.
