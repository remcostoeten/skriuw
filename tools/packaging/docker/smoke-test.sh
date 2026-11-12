#!/usr/bin/env bash
set -Eeuo pipefail

image="${1:?usage: smoke-test.sh <image>}"
port="${SMOKE_PORT:-18080}"
name="skriuw-web-smoke-$$"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" -p "127.0.0.1:${port}:80" "$image" >/dev/null

for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "http://127.0.0.1:${port}/" && break
  sleep 1
done

expect_status() {
  local path="$1" want="$2" got
  got="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}${path}")"
  [[ "$got" == "$want" ]] || { echo "GET ${path}: expected ${want}, got ${got}" >&2; docker logs "$name" >&2; exit 1; }
}

expect_status / 200
expect_status /index.html 200
expect_status /sw.js 200
expect_status /manifest.webmanifest 200
expect_status /notes/deep-link 200
expect_status /assets/missing-chunk.js 404

curl -fsS "http://127.0.0.1:${port}/" | grep -q '<div id="root"' || { echo "index.html has no #root mount" >&2; exit 1; }
curl -sI "http://127.0.0.1:${port}/sw.js" | grep -qi '^cache-control: no-cache' || { echo "sw.js is cacheable" >&2; exit 1; }

echo "smoke test passed for ${image}"
