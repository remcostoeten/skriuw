# Contributing to Skriuw

Thank you for helping improve Skriuw. Bug fixes, documentation improvements, tests, accessibility work, and focused features are welcome.

## Before you start

Skriuw contains two product lines:

- The repository root is the current (v2) local-first desktop application.
- `v1/` contains the frozen legacy web, mobile, and self-hosted line.

Check for an existing issue before starting a large change. Open an issue first when a proposal changes persisted data, public contracts, security behavior, or an architectural decision.

Do not report vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## Development setup

### v2

Install Rust 1.95, Bun 1.3, Node.js 24, Bash, and the platform dependencies required by Tauri.

```bash
./bin/setup
./bin/check
```

Build individual targets with:

```bash
./bin/build browser
./bin/build desktop
```

TypeScript is formatted by oxfmt and linted by oxlint; both run inside `./bin/check`. Run them directly from the repository root:

```bash
bun run format        # rewrite files in place
bun run lint          # report findings
bun run lint:fix      # apply safe automatic fixes
```

The rule set and the reasoning behind it are recorded in [ADR-0050](../docs/adr/0050-typescript-format-and-lint.md). Fix findings rather than suppressing them; a suppression needs `-- <reason>` on the same line.

See [docs/development.md](../docs/development.md#commands) for the command reference.

Generic v2 utilities belong in [`packages/shared`](../packages/shared/README.md).
Import helpers directly from `@skriuw/shared/helpers/<name>`; keep product rules
in `renderer-core`. See [TypeScript testing](../docs/testing.md) for suite placement.

### v2 mobile

`apps/workspace/`, `apps/site/`, `apps/mobile/`, and `packages/*` are Bun workspaces resolved from one root
lockfile, so `bun install` at the repository root installs them together. `services/sync/`,
the harnesses under `apps/workspace/harnesses/` and `v1/` stay outside the workspace and
keep their own installs.

```bash
bun install          # from the repository root
./bin/dev mobile     # expo start
./bin/check mobile   # the mobile product gate
```

`./bin/check mobile` is deliberately separate from `./bin/check`.
Run it for changes under `apps/mobile/`, `packages/` or `crates/skriuw-mobile`.

Android is the local verification target; iOS artifacts come from EAS builds.
The client is described by
[ADR-0048](../docs/adr/0048-native-mobile-shell-over-shared-core.md) and
[docs/specs/mobile-app.md](../docs/specs/mobile-app.md).

### v1

Install Bun 1.3 and Node.js 24, then:

```bash
cd v1
bun install
cp .env.example .env.local
bun dev
```

The environment variables required by the web application are documented in [v1/apps/documentation/content/docs/infra/environment-variables.mdx](../v1/apps/documentation/content/docs/infra/environment-variables.mdx).

Common checks, all run from `v1/`:

```bash
bun lint
bun typecheck
bun test
bun run build
```

## Pull requests

- Keep each pull request focused on one coherent change.
- Explain the user-visible outcome and the reason for the change.
- Add or update tests for changed behavior.
- Update durable documentation when an interface, command, or workflow changes.
- Include screenshots or recordings for visible interface changes.
- Preserve unrelated working-tree changes.
- Ensure generated contracts and lockfiles are current when applicable.
- Run the checks relevant to the files you changed.

Architecture decisions for v2 live in [docs/adr](../docs/adr). Changes that contradict an accepted decision should update or supersede the ADR explicitly.

## Commit and review expectations

Write concise, imperative commit messages. Reviewers may ask for smaller modules, clearer tests, accessibility fixes, migration evidence, or documentation before merging.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](../LICENSE).
