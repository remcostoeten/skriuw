# Contributing to Skriuw

Thank you for helping improve Skriuw. Bug fixes, documentation improvements, tests, accessibility work, and focused features are welcome.

## Before you start

Skriuw contains two product lines:

- The repository root is the current (v2) local-first desktop application.
- `v1/` contains the frozen legacy web, mobile, and self-hosted line.

Git hooks live at the repository root and are shared by both lines. Enable them once per clone:

```bash
git config core.hooksPath .husky/_
```

Check for an existing issue before starting a large change. Open an issue first when a proposal changes persisted data, public contracts, security behavior, or an architectural decision.

Do not report vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## Development setup

### v2

Install Rust 1.95, Bun 1.3, Node.js 24, Bash, and the platform dependencies required by Tauri.

```bash
./scripts/bootstrap.sh
./scripts/check.sh
```

Build individual targets with:

```bash
./scripts/build.sh web
./scripts/build.sh desktop
```

See [README.md](README.md) for the complete command reference.

### v1

Install Bun 1.3 and Node.js 24, then:

```bash
cd v1
bun install
cp .env.example .env.local
bun dev
```

The environment variables required by the web application are documented in [v1/apps/documentation/content/docs/infra/environment-variables.mdx](v1/apps/documentation/content/docs/infra/environment-variables.mdx).

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

Architecture decisions for v2 live in [docs/adr](docs/adr). Changes that contradict an accepted decision should update or supersede the ADR explicitly.

## Commit and review expectations

Write concise, imperative commit messages. Reviewers may ask for smaller modules, clearer tests, accessibility fixes, migration evidence, or documentation before merging.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).
