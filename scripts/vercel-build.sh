#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_dir="$repo_dir/app"
output_dir="$repo_dir/.build/vercel-public"
site_dir="$repo_dir/site"
tool_dir="$repo_dir/.build/vercel-tools"
task_cargo_home="$repo_dir/.build/vercel-cargo"
task_rustup_home="$repo_dir/.build/vercel-rustup"

export PATH="$tool_dir/bin:$PATH"

if ! command -v cargo >/dev/null 2>&1; then
  export CARGO_HOME="$task_cargo_home"
  export RUSTUP_HOME="$task_rustup_home"
  export PATH="$CARGO_HOME/bin:$PATH"
  rustup_installer="$repo_dir/.build/rustup-init.sh"
  mkdir -p "$(dirname "$rustup_installer")"
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
    https://sh.rustup.rs -o "$rustup_installer"
  sh "$rustup_installer" -y --no-modify-path --profile minimal --default-toolchain 1.95.0
fi

rustup target add wasm32-unknown-unknown --toolchain 1.95.0

# The sqlite-wasm-rs C shim only compiles for wasm32 with clang, which the
# Vercel build image stopped shipping (previews went red days before any
# repository change). Its clang 15 also defaults to C17, while the shim
# header uses C23 [[noreturn]] syntax, so pin the C standard for the
# wasm32 target. gnu2x, not c2x: strict c2x defines __STRICT_ANSI__,
# which stops musl's features.h from defaulting _BSD_SOURCE/_XOPEN_SOURCE
# and leaves off_t undefined in the shim's stdio internals.
if ! command -v clang >/dev/null 2>&1; then
  dnf install --assumeyes clang
fi
export CFLAGS_wasm32_unknown_unknown="${CFLAGS_wasm32_unknown_unknown:--std=gnu2x}"

if ! command -v wasm-bindgen >/dev/null 2>&1 || \
  [[ "$(wasm-bindgen --version)" != "wasm-bindgen 0.2.126" ]]; then
  cargo install \
    --locked \
    --root "$tool_dir" \
    --version 0.2.126 \
    wasm-bindgen-cli
fi

"$repo_dir/scripts/build-browser-wasm.sh"

(
  cd "$app_dir"
  SKRIUW_WEB_BASE="/app/" bun run build:frontend
)

if [[ -z "$output_dir" || "$output_dir" != "$repo_dir/.build/vercel-public" ]]; then
  printf 'Refusing to replace an unexpected deployment directory: %s\n' "$output_dir" >&2
  exit 1
fi
rm -rf "$output_dir"
mkdir -p "$output_dir/app"
cp -R "$site_dir/." "$output_dir/"
cp "$app_dir/public/favicon.ico" "$output_dir/favicon.ico"
cp "$app_dir/src-tauri/icons/icon.png" "$output_dir/app-icon.png"
cp "$repo_dir/docs/assets/demo.gif" "$output_dir/demo.gif"
cp "$repo_dir/docs/assets/preview.png" "$output_dir/preview.png"
cp -R "$app_dir/dist/." "$output_dir/app/"
