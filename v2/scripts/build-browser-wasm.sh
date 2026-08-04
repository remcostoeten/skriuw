#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact="$repo_dir/target/wasm32-unknown-unknown/release/skriuw_sqlite_wasm.wasm"
output_dir="$repo_dir/.build/browser-wasm"

command -v cargo >/dev/null 2>&1 || { echo "cargo is required" >&2; exit 1; }
command -v wasm-bindgen >/dev/null 2>&1 || {
  echo "wasm-bindgen-cli 0.2.126 is required; run ./scripts/bootstrap.sh" >&2
  exit 1
}

version="$(wasm-bindgen --version)"
[[ "$version" == "wasm-bindgen 0.2.126" ]] || {
  echo "expected wasm-bindgen 0.2.126, found: $version" >&2
  exit 1
}

cd "$repo_dir"
cargo build \
  -p skriuw-sqlite-wasm \
  --target wasm32-unknown-unknown \
  --release \
  --locked

mkdir -p "$output_dir"
wasm-bindgen "$artifact" \
  --target web \
  --out-dir "$output_dir"
