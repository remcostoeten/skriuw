#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"

for script in bin/* tools/scripts/*.sh; do
  bash -n "$script"
  [[ -x "$script" ]]
done
for script in tools/scripts/*.mjs; do
  node --check "$script"
done
for command in dev build check; do
  (cd "${TMPDIR:-/tmp}" && "$repo_dir/bin/$command" --help)
  if "$repo_dir/bin/$command" unknown-target; then
    printf '%s accepted an unknown target\n' "$command" >&2
    exit 1
  fi
done
bun --cwd=apps/site run build
node tools/scripts/test-web-seo.mjs
grep -Fq '"build": "../../bin/build browser"' apps/workspace/package.json
grep -Fq '"tauri": "../../tools/scripts/tauri.sh"' apps/workspace/package.json
grep -Fq '"tauri:build": "../../bin/build desktop"' apps/workspace/package.json
grep -Fq '"check": "bun run types:check && bun run typecheck && bun run test"' apps/sync/package.json
grep -Fq '"beforeBuildCommand": "bash ../../tools/scripts/run-in.sh apps/workspace build:frontend"' apps/workspace/src-tauri/tauri.conf.json
grep -Fq 'run: ./bin/build ci' .github/workflows/ci-v2.yml
grep -Fq 'run: ./bin/check browser' .github/workflows/ci-v2.yml
grep -Fq 'wasm-bindgen-0.2.126' .github/workflows/ci-v2.yml
grep -Fq 'SKRIUW_WEB_BASE="/app/" bun run build:frontend' tools/scripts/vercel-build.sh
grep -Fq 'cp -R "$app_dir/dist/." "$web_dir/public/app/"' tools/scripts/vercel-build.sh
grep -Fq '"buildCommand": "bash ../../tools/scripts/vercel-build.sh"' apps/site/vercel.json
grep -Fq '"build": "next build"' apps/site/package.json
grep -Fq 'run_step "Browser SQLite WASM module"' tools/scripts/build.sh
grep -Fq '(cd apps/sync && bun install --frozen-lockfile)' .github/workflows/ci-v2.yml
