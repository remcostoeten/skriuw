#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

command -v cargo >/dev/null 2>&1 || { echo "cargo is required" >&2; exit 1; }
command -v rustup >/dev/null 2>&1 || { echo "rustup is required" >&2; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "bun is required" >&2; exit 1; }

rustup show active-toolchain
cargo fetch
(cd "$repo_dir/app" && bun install --frozen-lockfile)
(cd "$repo_dir/spikes/ui-architecture" && bun install --frozen-lockfile)
(cd "$repo_dir/spikes/renderer-store" && bun install --frozen-lockfile)
./scripts/generate.sh
./scripts/check.sh
