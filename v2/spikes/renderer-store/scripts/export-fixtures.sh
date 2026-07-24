#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../.."
cargo run --release --locked -p skriuw-fixtures --example export_tree_projection -- spikes/renderer-store/public/fixtures
