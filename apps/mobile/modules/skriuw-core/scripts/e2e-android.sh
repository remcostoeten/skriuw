#!/usr/bin/env bash
# Proves the module on a running Android emulator or device: open the
# workspace, submit one operation, kill the process, relaunch, read it back.
#
# The probe screen is copied into apps/mobile/app only for the duration of the run,
# because a route has to live there to be reachable; it is removed on exit.
#
# Requirements: a booted emulator or device visible to adb, plus everything
# scripts/build-android.sh needs.
set -Eeuo pipefail

module_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mobile_dir="$(cd "$module_dir/../.." && pwd)"
package="dev.skriuw.app"
route="$mobile_dir/app/skriuw-core-probe.tsx"
marker="SKRIUW_CORE_PROBE"

fail() {
  printf 'skriuw-core e2e failed: %s\n' "$1" >&2
  exit 1
}

# `expo run:android` rewrites the android and ios scripts in package.json on
# its first prebuild; that file is not this module's to change.
manifest_backup="$(mktemp)"
cp "$mobile_dir/package.json" "$manifest_backup"

cleanup() {
  rm -f "$route"
  cp "$manifest_backup" "$mobile_dir/package.json"
  rm -f "$manifest_backup"
}
trap cleanup EXIT

command -v adb >/dev/null 2>&1 || fail "adb is not on PATH"
[[ "$(adb get-state 2>/dev/null)" == "device" ]] || fail "no booted emulator or device"

if [[ ! -d "$module_dir/android/src/main/jniLibs" ]]; then
  "$module_dir/scripts/build-android.sh"
fi

cp "$module_dir/e2e/probe-route.tsx" "$route"
# Only the connected device's ABI is built: a four-ABI release APK does not fit
# on a stock emulator image that already holds other applications.
abi="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
(cd "$mobile_dir" && bunx expo prebuild --platform android --no-install)
(cd "$mobile_dir/android" && ./gradlew app:assembleRelease -x lint -x test "-PreactNativeArchitectures=$abi")
adb install -r "$mobile_dir/android/app/build/outputs/apk/release/app-release.apk"

await_marker() {
  local deadline=$((SECONDS + 90))
  local line=""
  while ((SECONDS < deadline)); do
    line="$(adb logcat -d -s ReactNativeJS:V | grep -F "$marker" | tail -n 1 || true)"
    if [[ -n "$line" ]]; then
      printf '%s\n' "$line"
      return 0
    fi
    sleep 1
  done
  return 1
}

launch_probe() {
  adb shell am force-stop "$package"
  adb logcat -c
  adb shell am start -W -a android.intent.action.VIEW -d "skriuw:///skriuw-core-probe" "$package" >/dev/null
}

adb shell pm clear "$package" >/dev/null

launch_probe
first="$(await_marker)" || fail "the probe never reported after the first launch"
[[ "$first" == *"$marker created"* ]] || fail "first launch: $first"
printf 'first launch:  %s\n' "$first"

launch_probe
second="$(await_marker)" || fail "the probe never reported after the relaunch"
[[ "$second" == *"$marker read-back"* ]] || fail "relaunch: $second"
printf 'relaunch:      %s\n' "$second"

printf 'skriuw-core e2e passed\n'
