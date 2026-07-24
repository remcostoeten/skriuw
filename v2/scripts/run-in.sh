#!/usr/bin/env bash
# Run a package.json script inside <dir> (relative to the repo root) using
# whichever of bun/pnpm/npm is detected. Used by the root package.json and by
# app/src-tauri/tauri.conf.json's beforeDevCommand/beforeBuildCommand so
# neither is pinned to one package manager.
#
# Usage: run-in.sh <dir> <script> [args...]
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_dir/scripts/lib/pm.sh"

dir="$1"
shift
pm_cmd "$repo_dir/$dir" "$@"
exec "${PM_CMD[@]}"
