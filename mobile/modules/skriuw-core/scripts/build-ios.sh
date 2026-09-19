#!/usr/bin/env bash
# Builds crates/skriuw-mobile into ios/Frameworks/SkriuwMobile.xcframework and
# generates the Swift bindings into ios/Generated. macOS only: a macOS CI
# runner produces the xcframework and the application build consumes it as an
# artifact unpacked into the same two directories (ADR-0048).
#
# Requirements:
#   Xcode command line tools
#   rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
set -Eeuo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'The iOS xcframework can only be built on macOS.\n' >&2
  exit 2
fi

module_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$module_dir/../../.." && pwd)"
frameworks_dir="$module_dir/ios/Frameworks"
generated_dir="$module_dir/ios/Generated"
staging_dir="$repo_dir/target/skriuw-mobile-ios"
targets=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios)

cd "$repo_dir"
rm -rf "$frameworks_dir" "$generated_dir" "$staging_dir"
mkdir -p "$frameworks_dir" "$generated_dir" "$staging_dir/headers" "$staging_dir/simulator"

# Same reason as build-android.sh: the boundary guard needs unwinding panics.
for target in "${targets[@]}"; do
  cargo build --config 'profile.release.panic="unwind"' -p skriuw-mobile --release --locked --target "$target"
done

cargo run --quiet --manifest-path crates/skriuw-mobile/bindgen/Cargo.toml -- \
  generate --library target/aarch64-apple-ios/release/libskriuw_mobile.a \
  --language swift --no-format --out-dir "$staging_dir/bindings"

mv "$staging_dir/bindings/skriuw_mobile.swift" "$generated_dir/"
mv "$staging_dir/bindings/skriuw_mobileFFI.h" "$staging_dir/headers/"
mv "$staging_dir/bindings/skriuw_mobileFFI.modulemap" "$staging_dir/headers/module.modulemap"

lipo -create \
  target/aarch64-apple-ios-sim/release/libskriuw_mobile.a \
  target/x86_64-apple-ios/release/libskriuw_mobile.a \
  -output "$staging_dir/simulator/libskriuw_mobile.a"

xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libskriuw_mobile.a -headers "$staging_dir/headers" \
  -library "$staging_dir/simulator/libskriuw_mobile.a" -headers "$staging_dir/headers" \
  -output "$frameworks_dir/SkriuwMobile.xcframework"

du -sh "$frameworks_dir/SkriuwMobile.xcframework"
