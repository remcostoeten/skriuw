#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1

if [[ "${1:-}" == "build" ]]; then
  shift
  exec "$repo_dir/scripts/build.sh" desktop "$@"
fi

# tauri resolves beforeDevCommand's relative paths from the cwd, so run from app/
cd "$repo_dir/app"
exec "$repo_dir/app/node_modules/.bin/tauri" "$@" \
  2> >(sed -u '/Failed to load module "appmenu-gtk-module"/d' >&2)
