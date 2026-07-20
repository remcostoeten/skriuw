#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

command -v cargo >/dev/null 2>&1 || { echo "cargo is required" >&2; exit 1; }
command -v rustup >/dev/null 2>&1 || { echo "rustup is required" >&2; exit 1; }

rustup show active-toolchain
cargo fetch
./scripts/generate.sh
./scripts/check.sh
