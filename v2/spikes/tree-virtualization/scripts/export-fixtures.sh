#!/usr/bin/env bash
set -euo pipefail

spike_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$spike_dir/../.." && pwd)"

cargo run --release --locked --manifest-path "$repo_dir/Cargo.toml" \
  -p skriuw-fixtures --example export_tree_projection -- \
  "$spike_dir/public/fixtures"
