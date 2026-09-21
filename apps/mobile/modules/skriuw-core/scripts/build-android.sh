#!/usr/bin/env bash
# Builds what the Android half of this module cannot be compiled without:
# `libskriuw_mobile.so` per ABI into android/src/main/jniLibs, and the UniFFI
# Kotlin bindings generated from the same sources. Both are build output and
# are not committed.
#
# Requirements, none of which the workspace gate installs:
#   rustup target add aarch64-linux-android x86_64-linux-android
#   cargo install cargo-ndk
#   ANDROID_NDK_HOME, or an NDK under $ANDROID_HOME/ndk
set -Eeuo pipefail

module_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$module_dir/../../../.." && pwd)"
profile="${1:-release}"
jni_dir="$module_dir/android/src/main/jniLibs"
bindings_dir="$module_dir/android/src/main/java"
targets=(aarch64-linux-android x86_64-linux-android)

case "$profile" in
  release) artifact_dir="release" ;;
  dev|debug) profile="dev"; artifact_dir="debug" ;;
  *)
    printf 'Unknown profile: %s. Use release or dev.\n' "$profile" >&2
    exit 2
    ;;
esac

command -v cargo-ndk >/dev/null 2>&1 || {
  printf 'Missing cargo-ndk. See the header of this script.\n' >&2
  exit 2
}

if [[ -z "${ANDROID_NDK_HOME:-}" ]]; then
  sdk_dir="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  newest_ndk="$(find "$sdk_dir/ndk" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -n 1)"
  if [[ -z "$newest_ndk" ]]; then
    printf 'ANDROID_NDK_HOME is not set and no NDK was found under ANDROID_HOME.\n' >&2
    exit 2
  fi
  export ANDROID_NDK_HOME="$newest_ndk"
fi

cd "$repo_dir"

# The workspace release profile aborts on panic, which would turn the facade's
# boundary guard into dead code and abort the whole application instead of
# returning a typed error. Mobile artifacts unwind.
panic_override=(--config 'profile.release.panic="unwind"')

target_flags=()
for target in "${targets[@]}"; do
  target_flags+=(--target "$target")
done

rm -rf "$jni_dir"
cargo ndk "${target_flags[@]}" --platform 24 --output-dir "$jni_dir" -- \
  build "${panic_override[@]}" -p skriuw-mobile --profile "$profile" --locked

# The release profile strips symbols, and the UniFFI metadata the generator
# reads goes with them, so the bindings come from an unstripped host build of
# the same sources.
cargo build --quiet -p skriuw-mobile --locked
rm -rf "$bindings_dir/uniffi"
cargo run --quiet --locked --manifest-path "$repo_dir/crates/skriuw-mobile/bindgen/Cargo.toml" -- \
  generate --library "$repo_dir/target/debug/libskriuw_mobile.so" \
  --language kotlin --no-format --out-dir "$bindings_dir"

printf '\nlibskriuw_mobile.so\n'
find "$jni_dir" -name 'libskriuw_mobile.so' -exec du -h {} + | sed 's/^/  /'
