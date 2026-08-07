#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

command -v cargo >/dev/null 2>&1 || { echo "cargo is required" >&2; exit 1; }
command -v rustup >/dev/null 2>&1 || { echo "rustup is required" >&2; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "bun is required" >&2; exit 1; }

rustup show active-toolchain
if ! command -v wasm-bindgen >/dev/null 2>&1 || [[ "$(wasm-bindgen --version)" != "wasm-bindgen 0.2.126" ]]; then
  cargo install wasm-bindgen-cli --version 0.2.126 --locked
fi
cargo fetch
(cd "$repo_dir/app" && bun install --frozen-lockfile)
(cd "$repo_dir/cloud" && bun install --frozen-lockfile)
(cd "$repo_dir/spikes/ui-architecture" && bun install --frozen-lockfile)
(cd "$repo_dir/spikes/renderer-store" && bun install --frozen-lockfile)
./scripts/generate.sh
./scripts/build-browser-wasm.sh
./scripts/check.sh
