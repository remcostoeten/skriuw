#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

cargo build \
  -p skriuw-domain \
  -p skriuw-storage \
  -p skriuw-sqlite-wasm \
  --target wasm32-unknown-unknown \
  --locked

./scripts/build-browser-wasm.sh
bun --cwd=app run e2e:browser-storage
