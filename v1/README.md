# Skriuw v1 (frozen)

This directory holds the original Skriuw product line: the Next.js web app, the Expo mobile app, the Tauri desktop shell, the collaboration worker, the documentation site, and the shared packages behind them.

**v1 is frozen.** It is no longer hosted at skriuw.com and receives no new features. Active development happens in the repository root. See the [root README](../README.md) for the comparison between the two lines.

It is kept here because the documentation site still builds from `apps/documentation`, and because the self-hosted Docker image is still published from this tree.

## Getting the frozen release

v1 stopped at `0.25.0`. Nothing below requires the v2 toolchain.

```bash
# source as it shipped, before the move into v1/
git clone --branch v0.25.0 --single-branch \
    https://github.com/remcostoeten/skriuw.git skriuw-v1

# self-host image, pinned to the last v1 version
docker pull ghcr.io/remcostoeten/skriuw:0.25.0
```

The `:latest` container tag is still built from this tree, but it is rebuilt on every v2 release, so pin `0.25.0` if you want the frozen version.

Desktop installers (`.dmg`, `.exe`, `.deb`, `.rpm`, AppImage) are attached to the [`desktop-v0.25.0` release](https://github.com/remcostoeten/skriuw/releases/tag/desktop-v0.25.0), published 2026-07-20. Note that these are the _v1_ desktop builds; the current desktop app is v2 and ships under the `v2-v*` tags.

Within this repository, `f74af74f` is the last commit that touched v1 before the freeze, and the `v0.25.0` tag predates the move into `v1/`.

## Layout

```text
apps/web/              Next.js application
apps/mobile/           Expo mobile application
apps/desktop/          Tauri desktop shell
apps/collab/           Cloudflare collaboration worker
apps/documentation/    canonical documentation website source
apps/extension/        Chrome web clipper
packages/              shared packages
prisma/                database schema and migrations
```

## Development

Requires Bun 1.3 and Node.js 24. Every command below runs from this directory.

```bash
cd v1
bun install
cp .env.example .env.local
bun dev
```

The required environment variables are documented in [apps/documentation/content/docs/infra/environment-variables.mdx](apps/documentation/content/docs/infra/environment-variables.mdx).

## Checks

```bash
bun lint
bun typecheck
bun test
bun run build
```

## Self-hosting

The Docker image is built from this directory. See [apps/documentation/content/docs/infra/self-host-docker.mdx](apps/documentation/content/docs/infra/self-host-docker.mdx).

```bash
docker compose up
```
