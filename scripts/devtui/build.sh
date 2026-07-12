#!/usr/bin/env bash
# Compiles the Skriuw dev TUI. Pass --run to launch it afterwards.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/bin/skriuw-dev"

if ! command -v go >/dev/null 2>&1; then
  echo "go is not installed — https://go.dev/dl" >&2
  exit 1
fi

RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --run) RUN=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      echo "usage: build.sh [--run] [--force]"
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

stale() {
  [ ! -x "$OUT" ] && return 0
  [ "$FORCE" -eq 1 ] && return 0
  for src in "$HERE"/*.go "$HERE/go.mod" "$HERE/go.sum"; do
    [ -e "$src" ] || continue
    [ "$src" -nt "$OUT" ] && return 0
  done
  return 1
}

if stale; then
  echo "building skriuw-dev…"
  mkdir -p "$HERE/bin"
  (cd "$HERE" && go build -trimpath -ldflags="-s -w" -o "$OUT" .)
  echo "built $OUT"
else
  echo "skriuw-dev is up to date"
fi

if [ "$RUN" -eq 1 ]; then
  cd "$ROOT"
  exec "$OUT"
fi
