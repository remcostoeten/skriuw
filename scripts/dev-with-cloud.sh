#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cloud_pid=""
local_cloud_url="http://localhost:8787"
production_cloud_url="https://skriuw-v2-cloud.remcostoeten.workers.dev"

case "${SKRIUW_DEV_CLOUD:-cloud}" in
  cloud)
    selected_cloud_url="$production_cloud_url"
    ;;
  local)
    selected_cloud_url="$local_cloud_url"
    ;;
  *)
    printf 'SKRIUW_DEV_CLOUD must be either "cloud" or "local".\n' >&2
    exit 1
    ;;
esac

cloud_url="${SKRIUW_CLOUD_URL:-$selected_cloud_url}"
export VITE_SKRIUW_CLOUD_URL="$cloud_url"

cloud_is_healthy() {
  # A half-dead Worker still accepts TCP but never answers, so bound the probe;
  # without a timeout the readiness loop blocks forever instead of failing.
  curl --fail --silent --show-error --max-time 2 "$local_cloud_url/health" >/dev/null 2>&1
}

cleanup() {
  if [[ -n "$cloud_pid" ]] && kill -0 "$cloud_pid" 2>/dev/null; then
    printf '\n[skriuw] Stopping local auth and sync Worker.\n'
    kill "$cloud_pid" 2>/dev/null || true
    wait "$cloud_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ "$cloud_url" == "$local_cloud_url" ]]; then
  if cloud_is_healthy; then
    printf '[skriuw] Reusing local auth and sync Worker at %s\n' "$local_cloud_url"
  else
    printf '[skriuw] Starting local auth and sync Worker at %s…\n' "$local_cloud_url"
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
      printf '[skriuw] Local auth Worker did not become ready at %s.\n' "$local_cloud_url" >&2
      exit 1
    fi
  fi
fi

printf '[skriuw] Auth and sync target: %s\n' "$cloud_url"
printf '[skriuw] Starting app:            http://localhost:5183\n\n'

bun --cwd="$repo_dir/app" run dev:vite -- "$@" &
vite_pid="$!"
wait "$vite_pid"
