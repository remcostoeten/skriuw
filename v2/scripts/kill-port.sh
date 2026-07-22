#!/usr/bin/env bash
set -Eeuo pipefail

port="${1:?usage: kill-port.sh <port>}"
pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"

if [[ -n "$pids" ]]; then
	echo "killing existing listener(s) on port $port: $pids"
	kill -9 $pids 2>/dev/null || true
fi
