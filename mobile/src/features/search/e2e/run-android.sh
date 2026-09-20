#!/usr/bin/env bash
# Proves the search surface on a running Android emulator or device: mount it
# over the 1,000-note fixture, run the benchmark queries, and read the
# query-to-results percentiles back out of logcat.
#
# The probe screen is copied into mobile/app only for the duration of the run,
# because a route has to live there to be reachable; it is removed on exit.
# This mirrors mobile/modules/skriuw-core/scripts/e2e-android.sh, which owns
# the same contract for the native module.
#
# What it measures: plan, command round trip and filter intersection against
# the in-memory adapter. The native core still refuses searchWorkspace, so the
# number is the floor for query-to-results on the device, not the cost of
# SQLite's own ranking.
#
# Requirements: a booted emulator or device visible to adb, plus everything
# mobile/modules/skriuw-core/scripts/build-android.sh needs.
set -Eeuo pipefail

feature_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mobile_dir="$(cd "$feature_dir/../../.." && pwd)"
module_dir="$mobile_dir/modules/skriuw-core"
package="dev.skriuw.app"
route="$mobile_dir/app/skriuw-search-probe.tsx"
marker="SKRIUW_SEARCH_PROBE"
ceiling_ms="${SEARCH_QUERY_P95_CEILING_MS:-120}"

fail() {
  printf 'search e2e failed: %s\n' "$1" >&2
  exit 1
}

# `expo run:android` rewrites the android and ios scripts in package.json on
# its first prebuild; that file is not this feature's to change.
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

cp "$feature_dir/e2e/probe-route.tsx" "$route"
# Only the connected device's ABI is built: a four-ABI release APK does not fit
# on a stock emulator image that already holds other applications.
abi="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
(cd "$mobile_dir" && bunx expo prebuild --platform android --no-install)
(cd "$mobile_dir/android" && ./gradlew app:assembleRelease -x lint -x test "-PreactNativeArchitectures=$abi")
adb install -r "$mobile_dir/android/app/build/outputs/apk/release/app-release.apk"

adb shell am force-stop "$package"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "skriuw:///skriuw-search-probe" "$package" >/dev/null

report=""
deadline=$((SECONDS + 120))
while ((SECONDS < deadline)); do
  report="$(adb logcat -d -s ReactNativeJS:V | grep -F "$marker" | tail -n 1 || true)"
  [[ -n "$report" ]] && break
  sleep 1
done

[[ -n "$report" ]] || fail "the probe never reported"
if [[ "$report" == *"$marker failed"* ]]; then
  fail "$report"
fi
printf '%s\n' "$report"

p95="$(sed -n 's/.*p95=\([0-9.]*\)ms.*/\1/p' <<<"$report")"
hits="$(sed -n 's/.*hits=\([0-9]*\).*/\1/p' <<<"$report")"
[[ -n "$p95" ]] || fail "no p95 in the report: $report"
[[ -n "$hits" && "$hits" -gt 0 ]] || fail "the benchmark queries matched nothing: $report"

awk -v value="$p95" -v ceiling="$ceiling_ms" 'BEGIN { exit !(value < ceiling) }' \
  || fail "query-to-results p95 ${p95}ms is over the ${ceiling_ms}ms ceiling"

printf 'search e2e passed: query-to-results p95 %sms over 1000 notes (ceiling %sms)\n' \
  "$p95" "$ceiling_ms"
