#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "build" ]]; then
  shift
  exec "$repo_dir/scripts/build.sh" desktop "$@"
fi

exec "$repo_dir/app/node_modules/.bin/tauri" "$@"
