#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
source "$repo_dir/scripts/lib/pm.sh"

command -v cargo >/dev/null 2>&1 || { echo "cargo is required" >&2; exit 1; }
command -v rustup >/dev/null 2>&1 || { echo "rustup is required" >&2; exit 1; }

rustup show active-toolchain
cargo fetch
pm_install "$repo_dir/app"
pm_install "$repo_dir/spikes/ui-architecture"
pm_install "$repo_dir/spikes/renderer-store"
./scripts/generate.sh
./scripts/check.sh
