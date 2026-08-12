#!/usr/bin/env bash
set -euo pipefail

# Runs a command with .dev.vars hidden. Wrangler folds .dev.vars secrets into
# generated types and vitest-pool-workers loads them into the test Worker, so
# on machines with local dev secrets the types drift-check and the fail-closed
# auth tests diverge from CI (which has no .dev.vars). Neither tool offers an
# opt-out, so the file steps aside for the duration of the command.
cloud_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dev_vars="$cloud_dir/.dev.vars"
hidden="$cloud_dir/.dev.vars.hidden-during-check"

restore() {
  if [[ -f "$hidden" ]]; then
    mv "$hidden" "$dev_vars"
  fi
}
trap restore EXIT

if [[ -f "$dev_vars" ]]; then
  mv "$dev_vars" "$hidden"
fi

"$@"
