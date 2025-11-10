#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."

cd "$ROOT_DIR"

# Build binaries for current platform only to keep smoke test fast
if [ -f "bin/servo-smoke" ]; then
    rm -f bin/servo-smoke
fi

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

OUTPUT="bin/servo-${OS}-${ARCH}-smoke"

GOOS="$OS" GOARCH="$ARCH" go build -o "$OUTPUT" ./cmd/servo

"$OUTPUT" --version

echo "Smoke test succeeded"
