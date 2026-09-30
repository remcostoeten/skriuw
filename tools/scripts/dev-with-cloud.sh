#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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
app_url="http://localhost:5183"

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  bold=$'\e[1m' dim=$'\e[2m' cyan=$'\e[36m' reset=$'\e[0m'
else
  bold="" dim="" cyan="" reset=""
fi

say() {
  printf '%s[skriuw]%s %s\n' "$dim" "$reset" "$1"
}

cloud_label() {
  case "$cloud_url" in
    "$production_cloud_url") printf 'production' ;;
    "$local_cloud_url") printf 'local worker' ;;
    *) printf 'custom' ;;
  esac
}

print_banner() {
  printf '\n  %sskriuw%s %s· dev%s\n\n' "$bold" "$reset" "$dim" "$reset"
  printf '  %sApp  %s  %s%s%s\n' "$dim" "$reset" "$cyan" "$app_url" "$reset"
  printf '  %sCloud%s  %s%s%s %s(%s)%s\n\n' "$dim" "$reset" "$cyan" "$cloud_url" "$reset" "$dim" "$(cloud_label)" "$reset"
}

cloud_is_healthy() {
  # A half-dead Worker still accepts TCP but never answers, so bound the probe;
  # without a timeout the readiness loop blocks forever instead of failing.
  curl --fail --silent --show-error --max-time 2 "$local_cloud_url/health" >/dev/null 2>&1
}

cleanup() {
  if [[ -n "$cloud_pid" ]] && kill -0 "$cloud_pid" 2>/dev/null; then
    printf '\n'
    say "Stopping local auth and sync Worker."
    kill "$cloud_pid" 2>/dev/null || true
    wait "$cloud_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ "$cloud_url" == "$local_cloud_url" ]]; then
  if cloud_is_healthy; then
    say "Reusing local auth and sync Worker at $local_cloud_url"
  else
    say "Starting local auth and sync Worker at $local_cloud_url…"
    (cd "$repo_dir/apps/sync" && ./node_modules/.bin/wrangler dev --port 8787) &
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
      say "Local auth Worker did not become ready at $local_cloud_url." >&2
      exit 1
    fi
  fi
fi

print_banner

bun --cwd="$repo_dir/apps/workspace" run --silent dev:vite -- "$@" &
vite_pid="$!"
wait "$vite_pid"
