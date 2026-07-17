#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MODE="${1:-full}"

if [[ "$MODE" != "quick" && "$MODE" != "full" ]]; then
  echo "usage: scripts/check-desktop.sh [quick|full]" >&2
  exit 2
fi

cd "$ROOT"

phase() {
  echo
  echo "==> $1"
}

phase "Rust format"
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check

phase "Rust Clippy"
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings

phase "Rust tests"
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml

phase "Desktop SPA typecheck"
bun run --cwd packages/web-spa typecheck

phase "Desktop SPA tests"
bun run --cwd packages/web-spa test

if [[ "$MODE" == "full" ]]; then
  phase "Desktop SPA production build"
  bun run --cwd packages/web-spa build

  phase "Desktop SPA bundle budget"
  bun scripts/check-desktop-bundle.ts
fi

phase "Desktop gate passed ($MODE)"
