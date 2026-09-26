#!/usr/bin/env bash
# The `eas-build-pre-install` hook of apps/mobile/package.json. EAS workers
# receive the repository without this module's gitignored Rust artifacts, and
# their images ship no Rust toolchain, so this installs the pinned toolchain
# and runs build-android.sh or build-ios.sh for the platform being built.
#
# It has to be the pre-install hook: on iOS, `eas-build-post-install` runs
# after `pod install`, which has already resolved the podspec's vendored
# framework and Swift sources to nothing.
set -Eeuo pipefail

scripts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$scripts_dir/../../../../.." && pwd)"

export PATH="$HOME/.cargo/bin:$PATH"
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain none --no-modify-path
fi

cd "$repo_dir"
rustup toolchain install

case "${EAS_BUILD_PLATFORM:-}" in
  android)
    rustup target add aarch64-linux-android x86_64-linux-android
    command -v cargo-ndk >/dev/null 2>&1 || cargo install cargo-ndk --version 4.1.2 --locked
    export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
    "$scripts_dir/build-android.sh"
    ;;
  ios)
    rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
    "$scripts_dir/build-ios.sh"
    ;;
  *)
    printf 'EAS_BUILD_PLATFORM is %s; expected android or ios.\n' "${EAS_BUILD_PLATFORM:-unset}" >&2
    exit 2
    ;;
esac
