#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_dir="$repo_dir/apps/workspace"
web_dir="$repo_dir/apps/site"

export CFLAGS_wasm32_unknown_unknown="${CFLAGS_wasm32_unknown_unknown:--std=gnu2x}"

"$repo_dir/tools/scripts/build-browser-wasm.sh"

(
  cd "$app_dir"
  SKRIUW_WEB_BASE="/app/" bun run build:frontend
)

rm -rf "$web_dir/public/app"
mkdir -p "$web_dir/public/app"
cp -R "$app_dir/dist/." "$web_dir/public/app/"

(
  cd "$web_dir"
  bun run build:vinext
)
