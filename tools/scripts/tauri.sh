#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1

if [[ "${1:-}" == "build" ]]; then
  shift
  exec "$repo_dir/bin/build" desktop "$@"
fi

single_instance_bus_name="dev.skriuw.app.SingleInstance"
dev_binary_dir="$repo_dir/apps/workspace/src-tauri/target"

say() {
  printf '[skriuw] %s\n' "$1" >&2
}

running_instance_pid() {
  if command -v busctl >/dev/null 2>&1; then
    { busctl --user status "$single_instance_bus_name" 2>/dev/null || true; } | sed -n 's/^PID=//p' | head -n 1
    return
  fi
  pgrep -x skriuw-app 2>/dev/null | head -n 1 || true
}

wait_for_exit() {
  local pid="$1"
  for _ in {1..50}; do
    if ! kill -0 "$pid" 2>/dev/null && [[ -z "$(running_instance_pid)" ]]; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

# The app's single-instance plugin makes a second launch focus the running
# window and exit, so `tauri dev` would stop seconds after starting with only
# "dev:vite exited with code 143" to show for it. A SKRIUW_DB override skips
# the plugin, so such runs may coexist with the real app.
ensure_no_running_instance() {
  if [[ -n "${SKRIUW_DB:-}" ]]; then
    return
  fi
  local pid
  pid="$(running_instance_pid)"
  if [[ -z "$pid" ]]; then
    return
  fi
  local executable
  executable="$(readlink "/proc/$pid/exe" 2>/dev/null || ps -o comm= -p "$pid" 2>/dev/null || printf 'unknown')"

  say "Skriuw is already running (pid $pid): $executable"
  say "A second instance hands off to it and exits, so the dev build would not start."

  if [[ "$executable" != "$dev_binary_dir"/* ]]; then
    say "Quit that Skriuw first, or run with SKRIUW_DB=<path> to use a separate database."
    exit 1
  fi

  if [[ ! -t 0 ]]; then
    say "It is a leftover dev build. Stop it with: kill $pid"
    exit 1
  fi

  local answer
  read -r -p "[skriuw] Stop the leftover dev build and continue? [Y/n] " answer
  if [[ "$answer" =~ ^[Nn] ]]; then
    exit 1
  fi
  kill "$pid" 2>/dev/null || true
  if ! wait_for_exit "$pid"; then
    say "pid $pid did not exit; stop it with: kill -9 $pid"
    exit 1
  fi
  say "Stopped pid $pid."
}

if [[ "${1:-}" == "dev" ]]; then
  ensure_no_running_instance
fi

# tauri resolves beforeDevCommand's relative paths from the cwd, so run from apps/workspace/
cd "$repo_dir/apps/workspace"
exec "$repo_dir/apps/workspace/node_modules/.bin/tauri" "$@" \
  2> >(sed -u '/Failed to load module "appmenu-gtk-module"/d' >&2)
