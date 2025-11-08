#!/usr/bin/env bash
set -euo pipefail

kill_port() {
  local port="$1"
  if pids=$(lsof -ti:"$port" 2>/dev/null) && [[ -n "$pids" ]]; then
    echo "Killing process on port $port"
    # shellcheck disable=SC2086
    kill -9 $pids
  fi
}

kill_port 42069   # Skriuw Next.js dev server
kill_port 6969    # Docs dev server
kill_port 1420    # Tauri dev server (default)

# Tauri sometimes leaves cargo-tauri / bun processes running without ports
pkill -f "tauri dev" >/dev/null 2>&1 && echo "Killed lingering Tauri dev processes" || true
