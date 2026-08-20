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

# `wrangler dev` escalates a dropped client WebSocket inside its dev proxy to a
# fatal "Network connection lost." error and exits. The desktop sync listener
# holds a long-lived /events socket open, so a single reload or app restart
# would otherwise kill the Worker for the rest of the session and leave the app
# reconnecting against a closed port. Supervise it instead of running it once.
supervise_cloud() {
  local worker_pid=""
  local started_at=0
  local fast_exits=0

  trap 'if [[ -n "$worker_pid" ]]; then kill "$worker_pid" 2>/dev/null || true; fi; exit 0' INT TERM

  cd "$repo_dir/cloud"
  while true; do
    started_at="$SECONDS"
    ./node_modules/.bin/wrangler dev --port 8787 &
    worker_pid="$!"
    wait "$worker_pid" 2>/dev/null || true
    worker_pid=""

    if (( SECONDS - started_at < 10 )); then
      fast_exits=$(( fast_exits + 1 ))
    else
      fast_exits=0
    fi

    if (( fast_exits >= 5 )); then
      printf '[skriuw] Local Worker keeps exiting on startup; giving up. Run wrangler dev in cloud/ to see why.\n' >&2
      exit 1
    fi

    printf '[skriuw] Local Worker exited; restarting it.\n' >&2
    sleep 1
  done
}

cleanup() {
  if [[ -n "$cloud_pid" ]] && kill -0 "$cloud_pid" 2>/dev/null; then
    printf '\n[skriuw] Stopping local auth and sync Worker.\n'
    # Wrangler spawns workerd, so signalling the supervisor alone strands
    # children still holding port 8787 and the next dev run fails to bind.
    kill -- -"$cloud_pid" 2>/dev/null || kill "$cloud_pid" 2>/dev/null || true
    wait "$cloud_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if cloud_is_healthy; then
  printf '[skriuw] Reusing local auth and sync Worker at http://localhost:8787\n'
else
  printf '[skriuw] Starting local auth and sync Worker at http://localhost:8787…\n'
  # Monitor mode puts the supervisor in its own process group so cleanup can
  # signal it together with wrangler and workerd.
  set -m
  supervise_cloud &
  cloud_pid="$!"
  set +m

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
