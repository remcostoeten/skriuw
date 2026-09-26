#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"

cargo build \
  -p skriuw-domain \
  -p skriuw-storage \
  -p skriuw-sqlite-wasm \
  --target wasm32-unknown-unknown \
  --locked

./tools/scripts/build-browser-wasm.sh
bun --cwd=apps/workspace run e2e:browser-storage
bun --cwd=apps/workspace run e2e:browser-reset
bun --cwd=apps/workspace run e2e:browser-account-switch
bun --cwd=apps/workspace run e2e
