#!/usr/bin/env bash
# Package-manager detection shared by build.sh, bootstrap.sh, and run-in.sh.
#
# Preference order: bun > pnpm > npm. Override with PM=pnpm (or npm/bun) in
# the environment to force a specific tool.

detect_pm() {
  if [[ -n "${PM:-}" ]]; then
    printf '%s' "$PM"
    return
  fi
  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
  elif command -v pnpm >/dev/null 2>&1; then
    printf 'pnpm'
  elif command -v npm >/dev/null 2>&1; then
    printf 'npm'
  else
    echo "No package manager found. Install bun, pnpm, or npm." >&2
    exit 1
  fi
}

pm="$(detect_pm)"

pm_version() {
  case "$pm" in
    bun) bun --version ;;
    pnpm) pnpm --version ;;
    npm) npm --version ;;
  esac
}

# Populates the PM_CMD array with argv to run a package.json script.
# Usage: pm_cmd <dir> <script> [args...]
pm_cmd() {
  local dir="$1" script="$2"
  shift 2
  case "$pm" in
    bun) PM_CMD=(bun --cwd="$dir" run "$script" "$@") ;;
    pnpm) PM_CMD=(pnpm --dir "$dir" "$script" "$@") ;;
    npm)
      PM_CMD=(npm --prefix "$dir" run "$script")
      if [[ $# -gt 0 ]]; then
        PM_CMD+=(-- "$@")
      fi
      ;;
  esac
}

pm_install() {
  local dir="$1"
  case "$pm" in
    bun) (cd "$dir" && bun install) ;;
    pnpm) (cd "$dir" && pnpm install --frozen-lockfile) ;;
    npm) (cd "$dir" && npm install) ;;
  esac
}
