#!/usr/bin/env bash
# Run a package.json script inside <dir> (relative to the repo root) with bun.
# Used by the root package.json and by app/src-tauri/tauri.conf.json's
# beforeDevCommand/beforeBuildCommand.
#
# Usage: run-in.sh <dir> <script> [args...]
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

dir="$1"
shift
exec bun --cwd="$repo_dir/$dir" run "$@"
