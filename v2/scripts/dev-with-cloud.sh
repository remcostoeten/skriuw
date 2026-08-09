#!/usr/bin/env bash
# Start the renderer with its local auth/sync Worker. This is only for local
# development; deployed Worker configuration remains an explicit Wrangler step.
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cloud_pid=""

cloud_is_healthy() {
  # A half-dead Worker still accepts TCP but never answers, so bound the probe;
  # without a timeout the readiness loop blocks forever instead of failing.
  curl --fail --silent --show-error --max-time 2 http://localhost:8787/health >/dev/null 2>&1
}

cleanup() {
  if [[ -n "$cloud_pid" ]] && kill -0 "$cloud_pid" 2>/dev/null; then
    printf '\n[skriuw] Stopping local auth and sync Worker.\n'
    kill "$cloud_pid" 2>/dev/null || true
    wait "$cloud_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if cloud_is_healthy; then
  printf '[skriuw] Reusing local auth and sync Worker at http://localhost:8787\n'
else
  printf '[skriuw] Starting local auth and sync Worker at http://localhost:8787…\n'
  (cd "$repo_dir/cloud" && ./node_modules/.bin/wrangler dev --port 8787) &
  cloud_pid="$!"

  for _ in {1..80}; do
    if cloud_is_healthy; then
      break
    fi
    if ! kill -0 "$cloud_pid" 2>/dev/null; then
      wait "$cloud_pid"
    fi
    sleep 0.25
  done

  if ! cloud_is_healthy; then
    printf '[skriuw] Local auth Worker did not become ready at http://localhost:8787.\n' >&2
    exit 1
  fi
fi

printf '[skriuw] Auth and sync ready: http://localhost:8787\n'
printf '[skriuw] Starting app:            http://localhost:5183\n\n'

bun --cwd="$repo_dir/app" run dev:vite -- "$@" &
vite_pid="$!"
wait "$vite_pid"
