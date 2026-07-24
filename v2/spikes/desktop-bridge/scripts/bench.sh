#!/usr/bin/env bash
set -euo pipefail

spike_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
result_file="$(mktemp)"
log_file="$(mktemp)"
process_id=""

cleanup() {
  if [[ -n "$process_id" ]] && kill -0 "$process_id" 2>/dev/null; then
    kill "$process_id" 2>/dev/null || true
    wait "$process_id" 2>/dev/null || true
  fi
  rm -f "$result_file" "$log_file"
}

trap cleanup EXIT

cd "$spike_dir"
if [[ "${SKRIUW_BRIDGE_SKIP_BUILD:-0}" != "1" ]]; then
  pnpm build
  cargo build --release --manifest-path src-tauri/Cargo.toml --locked
fi

SKRIUW_BRIDGE_RESULT="$result_file" \
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
"$spike_dir/src-tauri/target/release/skriuw-desktop-bridge-spike" \
  >"$log_file" 2>&1 &
process_id="$!"

for _attempt in $(seq 1 600); do
  if [[ -s "$result_file" ]]; then
    break
  fi
  if ! kill -0 "$process_id" 2>/dev/null; then
    sed -n '1,200p' "$log_file" >&2
    exit 1
  fi
  sleep 0.1
done

if [[ ! -s "$result_file" ]]; then
  sed -n '1,200p' "$log_file" >&2
  exit 1
fi

if head -c 8 "$result_file" | grep -q '^FAILURE:'; then
  cat "$result_file" >&2
  exit 1
fi

cat "$result_file"
