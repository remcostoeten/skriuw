#!/usr/bin/env bash
# Builds the mobile facade for the Android ABIs the Expo module loads and
# prints the stripped size of each `libskriuw_mobile.so`.
#
# Requirements, none of which the workspace gate installs:
#   rustup target add aarch64-linux-android x86_64-linux-android
#   cargo install cargo-ndk
#   ANDROID_NDK_HOME pointing at NDK r27 or newer
#
# Mobile 10 wires the same invocation into CI; until then this is the local
# record for the binary sizes quoted in README.md.
set -Eeuo pipefail

crate_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$crate_dir/../.." && pwd)"
profile="${1:-release}"
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
  printf 'ANDROID_NDK_HOME is not set. See the header of this script.\n' >&2
  exit 2
fi

cd "$repo_dir"

# The workspace release profile aborts on panic, which would turn the boundary
# guard in src/boundary.rs into dead code and abort the whole application
# instead of returning a typed error. Mobile artifacts unwind.
panic_override=(--config 'profile.release.panic="unwind"')

for target in "${targets[@]}"; do
  cargo ndk --target "$target" --platform 24 -- \
    build "${panic_override[@]}" -p skriuw-mobile --profile "$profile" --locked
done

printf '\nlibskriuw_mobile.so\n'
for target in "${targets[@]}"; do
  library="$repo_dir/target/$target/$artifact_dir/libskriuw_mobile.so"
  if [[ -f "$library" ]]; then
    printf '  %-24s %s\n' "$target" "$(du -h "$library" | awk '{print $1}')"
  else
    printf '  %-24s missing\n' "$target"
  fi
done
