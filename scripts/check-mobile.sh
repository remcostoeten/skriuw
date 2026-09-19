#!/usr/bin/env bash
# Product gate for the mobile client (docs/specs/mobile-app.md, R-Q3).
# Deliberately separate from scripts/check.sh: it is extended by later Mobile
# issues with facade tests, token and contract drift, and the Android emulator
# end-to-end suite.
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mobile_dir="$repo_dir/mobile"
cd "$repo_dir"

if [[ -z "${NO_COLOR:-}" ]] && { [[ -t 1 ]] || [[ -n "${FORCE_COLOR:-}" ]] || [[ "${CI:-}" == "true" ]]; }; then
  reset=$'\033[0m'
  bold=$'\033[1m'
  muted=$'\033[2m'
  red=$'\033[31m'
  green=$'\033[32m'
  blue=$'\033[34m'
else
  reset=""
  bold=""
  muted=""
  red=""
  green=""
  blue=""
fi

total_steps=2
step_index=0

fail() {
  printf '\n%s%sMOBILE CHECK FAILED%s  %s\n' "$bold" "$red" "$reset" "$1" >&2
  exit 1
}

run_step() {
  local label="$1"
  shift
  step_index=$((step_index + 1))
  printf '%s[%02d/%02d]%s %s%s%s\n' "$blue" "$step_index" "$total_steps" "$reset" "$bold" "$label" "$reset"
  printf '         %s$' "$muted"
  printf ' %q' "$@"
  printf '%s\n' "$reset"
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    printf '::group::%s\n' "$label"
  fi
  if ! "$@"; then
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      printf '::endgroup::\n'
      printf '::error title=%s failed::See the step output for the complete report.\n' "$label"
    fi
    fail "$label"
  fi
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    printf '::endgroup::\n'
  fi
  printf '         %s%s✓ passed%s\n\n' "$bold" "$green" "$reset"
}

command -v bun >/dev/null 2>&1 || fail "Missing required command: bun"
[[ -d "$mobile_dir/node_modules" ]] || fail "Mobile dependencies are missing. Run bun install at the repository root."

run_step "Mobile type safety" bun --cwd="$mobile_dir" run typecheck
run_step "Mobile unit tests" bun --cwd="$mobile_dir" run test

printf '%s\n' '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
printf '%s%sMOBILE CHECK SUCCEEDED%s\n' "$bold" "$green" "$reset"
