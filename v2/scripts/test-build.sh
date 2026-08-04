#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

bash -n scripts/build.sh scripts/build-browser-wasm.sh scripts/check.sh scripts/tauri.sh
NO_COLOR=1 ./scripts/build.sh --help | grep -Fq 'desktop    Verify everything and build the Tauri desktop application'
grep -Fq '"build": "../scripts/build.sh web"' app/package.json
grep -Fq '"tauri": "../scripts/tauri.sh"' app/package.json
grep -Fq '"tauri:build": "../scripts/build.sh desktop"' app/package.json
grep -Fq '"check": "bun run types:check && bun run typecheck && bun run test"' cloud/package.json
grep -Fq '"beforeBuildCommand": "bash ../scripts/run-in.sh app build:frontend"' app/src-tauri/tauri.conf.json
grep -Fq 'run: ./scripts/build.sh ci' .github/workflows/ci.yml
grep -Fq 'run: ./scripts/check-wasm.sh' .github/workflows/ci.yml
grep -Fq 'cargo install wasm-bindgen-cli --version 0.2.126 --locked' .github/workflows/ci.yml
grep -Fq 'run_step "Browser SQLite WASM module"' scripts/build.sh
grep -Fq '(cd cloud && bun install --frozen-lockfile)' .github/workflows/ci.yml
grep -Fq 'exec "$repo_dir/scripts/build.sh" check "$@"' scripts/check.sh
