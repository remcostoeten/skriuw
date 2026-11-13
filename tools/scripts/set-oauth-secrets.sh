#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sync_dir="$repo_dir/apps/sync"
dev_vars="$sync_dir/.dev.vars"

if [[ ! -t 0 ]]; then
  printf 'Run this script in an interactive terminal.\n' >&2
  exit 1
fi

providers=(github google)
declare -A labels=([github]="GitHub" [google]="Google")
declare -A values=()
last_target=""

confirm() {
  local answer
  read -r -p "$1 " answer
  answer="${answer:-$2}"
  [[ "$answer" =~ ^[Yy] ]]
}

read_value() {
  local prompt="$1" secret="$2" value
  if [[ "$secret" == "secret" ]]; then
    read -r -s -p "$prompt" value
    printf '\n' >&2
  else
    read -r -p "$prompt" value
  fi
  if [[ -n "$value" && ! "$value" =~ ^[A-Za-z0-9._~+/=:-]+$ ]]; then
    printf 'That value has characters a client id or secret does not use. Paste it again without spaces or quotes.\n' >&2
    exit 1
  fi
  printf '%s' "$value"
}

collect_values() {
  values=()
  local provider label id secret
  for provider in "${providers[@]}"; do
    label="${labels[$provider]}"
    id="$(read_value "$label client id (blank skips $label): " plain)"
    if [[ -z "$id" ]]; then
      continue
    fi
    secret="$(read_value "$label client secret: " secret)"
    if [[ -z "$secret" ]]; then
      printf '%s needs both a client id and a client secret.\n' "$label" >&2
      exit 1
    fi
    values["${provider^^}_CLIENT_ID"]="$id"
    values["${provider^^}_CLIENT_SECRET"]="$secret"
  done
}

prepare_values() {
  if [[ -n "$last_target" ]] && confirm "Reuse the values entered for $last_target? [Y/n]" Y; then
    return
  fi
  collect_values
}

write_dev_var() {
  local name="$1" value="$2" temp
  temp="$(mktemp "$sync_dir/.dev.vars.XXXXXX")"
  chmod 600 "$temp"
  VALUE="$value" NAME="$name" awk '
    BEGIN { line = ENVIRON["NAME"] "=\"" ENVIRON["VALUE"] "\"" }
    $0 ~ "^#? ?" ENVIRON["NAME"] "=" && !done { print line; done = 1; next }
    { print }
    END { if (!done) print line }
  ' "$dev_vars" >"$temp"
  mv "$temp" "$dev_vars"
}

apply_local() {
  if [[ ! -f "$dev_vars" ]]; then
    cp "$sync_dir/.dev.vars.example" "$dev_vars"
    chmod 600 "$dev_vars"
  fi
  local name
  for name in "${!values[@]}"; do
    write_dev_var "$name" "${values[$name]}"
    printf '  .dev.vars: %s\n' "$name"
  done
}

apply_worker() {
  local environment="$1" name
  local flags=()
  if [[ -n "$environment" ]]; then
    flags=(--env "$environment")
  fi
  for name in "${!values[@]}"; do
    printf '%s' "${values[$name]}" | (cd "$sync_dir" && bunx wrangler secret put "$name" "${flags[@]}") >/dev/null
    printf '  %s Worker: %s\n' "${environment:-production}" "$name"
  done
}

run_target() {
  local key="$1" label="$2" default="$3" note="$4" hint="Y/n"
  if [[ "$default" == "N" ]]; then
    hint="y/N"
  fi
  if ! confirm "Set $label? [$hint] $note" "$default"; then
    return
  fi
  prepare_values
  if [[ ${#values[@]} -eq 0 ]]; then
    printf '  Nothing entered, skipped %s.\n' "$label"
    return
  fi
  case "$key" in
    local) apply_local ;;
    production) apply_worker "" ;;
    preview) apply_worker preview ;;
  esac
  last_target="$label"
}

printf 'OAuth secrets for the Skriuw cloud Worker. Input for secrets is hidden.\n'
printf 'Register these callback URLs with each provider first:\n'
printf '  production: https://skriuw-v2-cloud.remcostoeten.workers.dev/api/auth/callback/<provider>\n'
printf '  preview:    https://skriuw-v2-cloud-preview.remcostoeten.workers.dev/api/auth/callback/<provider>\n'
printf '  local:      http://localhost:8787/api/auth/callback/<provider>\n\n'

run_target local "local .dev.vars" Y "(apps/sync/.dev.vars)"
run_target production "the production Worker" Y "(wrangler secret put)"
run_target preview "the preview Worker" N "(wrangler secret put --env preview)"

printf '\nDone. GET /health on each Worker lists the providers that are on in authProviders.\n'
