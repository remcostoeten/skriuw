#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

command -v cargo >/dev/null 2>&1 || { echo "cargo is required" >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required" >&2; exit 1; }
command -v rustup >/dev/null 2>&1 || { echo "rustup is required" >&2; exit 1; }

rustup show active-toolchain
cargo fetch
pnpm --dir app install --frozen-lockfile
pnpm --dir spikes/ui-architecture install --frozen-lockfile
pnpm --dir spikes/renderer-store install --frozen-lockfile
./scripts/generate.sh
./scripts/check.sh
