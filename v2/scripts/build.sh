#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_dir="$repo_dir/app"
source "$repo_dir/scripts/lib/pm.sh"
mode="${1:-workspace}"

if [[ $# -gt 0 ]]; then
  shift
fi

case "$mode" in
  check|ci|desktop|web|workspace) ;;
  -h|--help|help)
    cat <<'EOF'
Usage: ./scripts/build.sh [check|web|desktop|workspace|ci]

  check      Run every verification and coverage step without building
  web        Verify everything and build the renderer bundle
  desktop    Verify everything and build the Tauri desktop application
  workspace  Verify everything and build the Rust workspace
  ci         Verify everything and build release CLI and desktop artifacts

Environment:
  NO_COLOR=1       Disable ANSI color and terminal hyperlinks
  FORCE_COLOR=1    Enable ANSI color when output is not a terminal
EOF
    exit 0
    ;;
  *)
    printf 'Unknown build mode: %s\n' "$mode" >&2
    printf 'Run ./scripts/build.sh --help for usage.\n' >&2
    exit 2
    ;;
esac

cd "$repo_dir"

color_enabled=false
if [[ -z "${NO_COLOR:-}" ]] && { [[ -t 1 ]] || [[ -n "${FORCE_COLOR:-}" ]] || [[ "${CI:-}" == "true" ]]; }; then
  color_enabled=true
fi

if $color_enabled; then
  reset=$'\033[0m'
  muted=$'\033[2m'
  bold=$'\033[1m'
  red=$'\033[31m'
  green=$'\033[32m'
  yellow=$'\033[33m'
  blue=$'\033[34m'
  cyan=$'\033[36m'
else
  reset=""
  muted=""
  bold=""
  red=""
  green=""
  yellow=""
  blue=""
  cyan=""
fi

started_at="$(date +%s)"
build_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
log_dir="$repo_dir/.build/logs/$build_id"
mkdir -p "$log_dir"

case "$mode" in
  check) total_steps=10 ;;
  ci) total_steps=12 ;;
  *) total_steps=11 ;;
esac

step_index=0
last_log=""
last_duration=0

duration_text() {
  local seconds="$1"
  if (( seconds < 60 )); then
    printf '%ss' "$seconds"
  else
    printf '%dm %02ds' "$((seconds / 60))" "$((seconds % 60))"
  fi
}

absolute_path() {
  local path="$1"
  local directory
  directory="$(cd "$(dirname "$path")" && pwd)"
  printf '%s/%s' "$directory" "$(basename "$path")"
}

path_link() {
  local label="$1"
  local path="$2"
  local absolute
  absolute="$(absolute_path "$path")"
  if $color_enabled && [[ -t 1 ]] && [[ "${TERM:-}" != "dumb" ]]; then
    printf '\033]8;;file://%s\033\\%s\033]8;;\033\\' "$absolute" "$label"
  else
    printf '%s' "$absolute"
  fi
}

fail() {
  printf '\n%s%sBUILD FAILED%s  %s\n' "$bold" "$red" "$reset" "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

print_header() {
  local branch commit
  branch="$(git branch --show-current 2>/dev/null || printf 'detached')"
  commit="$(git rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
  printf '\n%s%sSKRIUW BUILD%s\n' "$bold" "$cyan" "$reset"
  printf '%sMode%s      %s\n' "$muted" "$reset" "$mode"
  printf '%sRevision%s  %s @ %s\n' "$muted" "$reset" "$branch" "$commit"
  printf '%sToolchain%s  Rust %s · Node %s · %s %s\n\n' "$muted" "$reset" "$(rustc --version | awk '{print $2}')" "$(node --version)" "$pm" "$(pm_version)"
}

print_failure_log() {
  local log="$1"
  printf '\n%s%sError output%s\n' "$bold" "$red" "$reset" >&2
  printf '%s\n' '------------------------------------------------------------------------------' >&2
  if grep -q '^✖ failing tests:' "$log"; then
    sed -n '/^✖ failing tests:/,$p' "$log" | tail -n 200 >&2
  else
    tail -n 240 "$log" >&2
  fi
  printf '%s\n' '------------------------------------------------------------------------------' >&2
  printf '%sFull log:%s ' "$muted" "$reset" >&2
  path_link "$(basename "$log")" "$log" >&2
  printf '\n' >&2
}

run_step() {
  local label="$1"
  local log_name="$2"
  shift 2
  step_index=$((step_index + 1))
  last_log="$log_dir/$log_name.log"
  local step_started status
  step_started="$(date +%s)"
  printf '%s[%02d/%02d]%s %s%s%s\n' "$blue" "$step_index" "$total_steps" "$reset" "$bold" "$label" "$reset"
  printf '         %s$' "$muted"
  printf ' %q' "$@"
  printf '%s\n' "$reset"
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    printf '::group::%s\n' "$label"
  fi
  set +e
  "$@" >"$last_log" 2>&1
  status=$?
  set -e
  last_duration=$(( $(date +%s) - step_started ))
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    printf '::endgroup::\n'
  fi
  if (( status != 0 )); then
    printf '         %s%s✗ failed%s in %s\n' "$bold" "$red" "$reset" "$(duration_text "$last_duration")" >&2
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      printf '::error title=%s failed::See the build log for complete output.\n' "$label"
    fi
    print_failure_log "$last_log"
    fail "$label"
  fi
  printf '         %s%s✓ passed%s in %s\n\n' "$bold" "$green" "$reset" "$(duration_text "$last_duration")"
}

rust_test_summary() {
  local log="$1"
  awk '
    /test result:/ {
      for (field = 1; field <= NF; field += 1) {
        if ($field == "passed;") passed += $(field - 1)
        if ($field == "ignored;") ignored += $(field - 1)
      }
    }
    END { printf "%d passed · %d ignored", passed, ignored }
  ' "$log"
}

renderer_summary() {
  local log="$1"
  local tests coverage
  tests="$(sed -n 's/^ℹ tests //p' "$log" | tail -n 1)"
  coverage="$(awk -F '|' '/all files/ {
    for (field = 2; field <= 4; field += 1) gsub(/[[:space:]]/, "", $field)
    result = $2 "% lines · " $3 "% branches · " $4 "% functions"
  } END { print result }' "$log")"
  printf '%s tests · executed source: %s' "${tests:-0}" "${coverage:-coverage unavailable}"
}

node_test_summary() {
  local log="$1"
  local tests
  tests="$(sed -n 's/^ℹ tests //p' "$log" | tail -n 1)"
  printf '%s passed' "${tests:-0}"
}

print_metric() {
  printf '         %s%s%s\n\n' "$yellow" "$1" "$reset"
}

human_size() {
  du -h "$1" | awk '{print $1}'
}

print_artifact() {
  local label="$1"
  local path="$2"
  [[ -e "$path" ]] || return 0
  printf '  %s◆%s %-20s ' "$cyan" "$reset" "$label"
  path_link "$path" "$path"
  if [[ -f "$path" ]]; then
    printf ' %s(%s)%s' "$muted" "$(human_size "$path")" "$reset"
  fi
  printf '\n'
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf -- '- `%s` — `%s`\n' "$label" "$path" >> "$GITHUB_STEP_SUMMARY"
  fi
}

print_cli_artifact() {
  local profile="$1"
  if [[ -f "$repo_dir/target/$profile/skriuw-cli" ]]; then
    print_artifact "Skriuw CLI" "$repo_dir/target/$profile/skriuw-cli"
  elif [[ -f "$repo_dir/target/$profile/skriuw-cli.exe" ]]; then
    print_artifact "Skriuw CLI" "$repo_dir/target/$profile/skriuw-cli.exe"
  fi
}

print_desktop_artifacts() {
  local binary_dir="$app_dir/src-tauri/target/release"
  local artifact
  if [[ -f "$binary_dir/skriuw-app" ]]; then
    print_artifact "Desktop binary" "$binary_dir/skriuw-app"
  elif [[ -f "$binary_dir/skriuw-app.exe" ]]; then
    print_artifact "Desktop binary" "$binary_dir/skriuw-app.exe"
  fi
  if [[ -d "$binary_dir/bundle" ]]; then
    while IFS= read -r artifact; do
      print_artifact "Desktop package" "$artifact"
    done < <(find "$binary_dir/bundle" -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.dmg' -o -name '*.msi' -o -name '*.nsis.zip' -o -name '*.rpm' \) | sort)
  fi
}

require_command bash
require_command cargo
require_command git
require_command node
require_command rustc
[[ -d "$app_dir/node_modules" ]] || fail "Frontend dependencies are missing. Run ./scripts/bootstrap.sh or install manually in app/."
[[ -d "$repo_dir/spikes/ui-architecture/node_modules" ]] || fail "UI architecture dependencies are missing. Run ./scripts/bootstrap.sh or install manually in spikes/ui-architecture/."
[[ -d "$repo_dir/spikes/renderer-store/node_modules" ]] || fail "Renderer-store dependencies are missing. Run ./scripts/bootstrap.sh or install manually in spikes/renderer-store/."

print_header

run_step "Generated contracts" "generated-contracts" cargo run --quiet -p xtask -- generate --check
run_step "Build entrypoint contract" "build-entrypoints" "$repo_dir/scripts/test-build.sh"
run_step "Rust formatting" "rust-format" cargo fmt --all --check
run_step "Rust lint" "rust-clippy" cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
run_step "Backend test suite" "backend-tests" cargo test --workspace --locked --no-fail-fast
print_metric "$(rust_test_summary "$last_log")"
run_step "Desktop bridge test suite" "desktop-tests" cargo test --manifest-path app/src-tauri/Cargo.toml --locked --no-fail-fast
print_metric "$(rust_test_summary "$last_log")"
pm_cmd "$repo_dir/spikes/ui-architecture" test
run_step "UI architecture regression suite" "ui-architecture-tests" "${PM_CMD[@]}"
print_metric "$(node_test_summary "$last_log")"
pm_cmd "$repo_dir/spikes/renderer-store" test
run_step "Renderer-store regression suite" "renderer-store-tests" "${PM_CMD[@]}"
print_metric "$(node_test_summary "$last_log")"
pm_cmd "$app_dir" test
run_step "Renderer test suite and coverage" "renderer-tests" "${PM_CMD[@]}"
print_metric "$(renderer_summary "$last_log")"
pm_cmd "$app_dir" typecheck
run_step "Renderer type safety" "renderer-typecheck" "${PM_CMD[@]}"

case "$mode" in
  check) ;;
  web)
    pm_cmd "$app_dir" build:frontend
    run_step "Renderer production bundle" "renderer-build" "${PM_CMD[@]}"
    ;;
  desktop)
    pm_cmd "$app_dir" tauri:build:raw --config '{"bundle":{"createUpdaterArtifacts":false}}' "$@"
    run_step "Tauri desktop application" "desktop-build" "${PM_CMD[@]}"
    ;;
  workspace)
    run_step "Rust workspace binaries" "workspace-build" cargo build --workspace --locked
    ;;
  ci)
    run_step "Rust release binaries" "workspace-build" cargo build --workspace --release --locked
    pm_cmd "$app_dir" tauri:build:raw "$@"
    run_step "Tauri release application" "desktop-build" "${PM_CMD[@]}"
    ;;
esac

elapsed=$(( $(date +%s) - started_at ))
printf '%s\n' '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
printf '%s%sBUILD SUCCEEDED%s  %s mode completed in %s\n' "$bold" "$green" "$reset" "$mode" "$(duration_text "$elapsed")"

if [[ "$mode" != "check" ]]; then
  printf '\n%sArtifacts%s\n' "$bold" "$reset"
  case "$mode" in
    web)
      print_artifact "Renderer bundle" "$app_dir/dist"
      ;;
    desktop)
      print_desktop_artifacts
      print_artifact "Renderer bundle" "$app_dir/dist"
      ;;
    workspace)
      print_cli_artifact "debug"
      ;;
    ci)
      print_cli_artifact "release"
      print_desktop_artifacts
      print_artifact "Renderer bundle" "$app_dir/dist"
      ;;
  esac
fi

printf '\n%sLogs%s       ' "$muted" "$reset"
path_link "$log_dir" "$log_dir"
printf '\n\n'
