#!/usr/bin/env bash
# Product gate for the mobile client (docs/specs/mobile-app.md, R-Q3).
# Deliberately separate from bin/check desktop, which owns the desktop tree and
# packages/renderer-core. This gate owns apps/mobile/, the skriuw-core module, and
# packages/theme's token generator, whose output only the mobile client consumes.
# The Android emulator suite and the facade's Rust tests run in CI, not here.
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mobile_dir="$repo_dir/apps/mobile"
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

total_steps=4
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

# The test script globs `**/__tests__/*.test.?ts`, so a suite written anywhere
# else is collected by nothing and fails silently by never running. Sixteen of
# these accumulated during the mobile epic before anyone noticed.
check_test_discovery() {
  local stray
  stray="$(
    find "$mobile_dir" \
      \( -path '*/node_modules' -o -path '*/.expo' -o -path '*/android/build' \) -prune -o \
      -type f \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.cts' -o -name '*.test.mts' \) -print |
      grep -v '/__tests__/' |
      sed "s|^$repo_dir/||" |
      sort
  )"
  if [[ -n "$stray" ]]; then
    printf 'These suites are outside a __tests__ directory, so the gate never runs them:\n%s\n' "$stray" >&2
    return 1
  fi
}

run_step "Root lockfile freshness" bun install --frozen-lockfile --dry-run
run_step "Test discovery" check_test_discovery
run_step "Mobile type safety" bun --cwd="$mobile_dir" run typecheck
run_step "Mobile unit tests" bun --cwd="$mobile_dir" run test

printf '%s\n' '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
printf '%s%sMOBILE CHECK SUCCEEDED%s\n' "$bold" "$green" "$reset"
