#!/usr/bin/env bash
# Proves the module on a running Android emulator or device: open the
# workspace, submit one operation, kill the process, relaunch, read it back.
#
# The probe screen is copied into apps/mobile/app only for the duration of the run,
# because a route has to live there to be reachable; it is removed on exit.
#
# Usage: e2e-android.sh [build|run|all]
#   build  assemble the release APK; needs no emulator, so CI runs it before one boots
#   run    install the built APK and run the probe on a booted emulator or device
#   all    both, the default
#
# Requirements: everything scripts/build-android.sh needs, and for run or all a
# booted emulator or device visible to adb.
set -Eeuo pipefail

mode="${1:-all}"

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

# The 2 GiB default heap and 512 MiB metaspace restart the Gradle daemon mid-build.
gradle_jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g"
apk="$mobile_dir/android/app/build/outputs/apk/release/app-release.apk"

require_device() {
  command -v adb >/dev/null 2>&1 || fail "adb is not on PATH"
  [[ "$(adb get-state 2>/dev/null)" == "device" ]] || fail "no booted emulator or device"
}

build_apk() {
  if [[ ! -d "$module_dir/android/src/main/jniLibs" ]]; then
    "$module_dir/scripts/build-android.sh"
  fi

  cp "$module_dir/e2e/probe-route.tsx" "$route"
  # Only one ABI is built: a four-ABI release APK does not fit on a stock
  # emulator image that already holds other applications.
  local abi="${SKRIUW_ANDROID_ABI:-}"
  if [[ -z "$abi" ]]; then
    require_device
    abi="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
  fi
  (cd "$mobile_dir" && bunx expo prebuild --platform android --no-install)
  (cd "$mobile_dir/android" && ./gradlew app:assembleRelease -x lint -x test "-PreactNativeArchitectures=$abi" "-Dorg.gradle.jvmargs=$gradle_jvmargs")
}

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

dump_device_log() {
  printf '::group::device log after the failed launch\n' >&2
  printf 'pid: %s\n' "$(adb shell pidof "$package" | tr -d '\r')" >&2
  adb logcat -d | grep -E "FATAL|AndroidRuntime|ReactNative|SKRIUW|skriuw|ActivityManager|libc|DEBUG" | tail -n 200 >&2 || true
  printf '::endgroup::\n' >&2
}

launch_probe() {
  adb shell am force-stop "$package"
  adb logcat -c
  adb shell am start -W -a android.intent.action.VIEW -d "skriuw:///skriuw-core-probe" "$package" >/dev/null
}

run_probe() {
  require_device
  [[ -f "$apk" ]] || fail "no APK at $apk, run the build mode first"
  adb install -r "$apk"

  adb shell pm clear "$package" >/dev/null

  launch_probe
  first="$(await_marker)" || { dump_device_log; fail "the probe never reported after the first launch"; }
  [[ "$first" == *"$marker created"* ]] || fail "first launch: $first"
  printf 'first launch:  %s\n' "$first"

  launch_probe
  second="$(await_marker)" || { dump_device_log; fail "the probe never reported after the relaunch"; }
  [[ "$second" == *"$marker read-back"* ]] || fail "relaunch: $second"
  printf 'relaunch:      %s\n' "$second"

  printf 'skriuw-core e2e passed\n'
}

case "$mode" in
  build) build_apk ;;
  run) run_probe ;;
  all) build_apk; run_probe ;;
  *) fail "unknown mode: $mode" ;;
esac
