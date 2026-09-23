#!/usr/bin/env bash
# Every TypeScript suite lives under __tests__/ at the path of the code it
# covers, and every suite there belongs to a Vitest project. A suite that
# breaks either rule is collected by nothing and silently never runs.
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

suite_pattern='\.(test|spec)\.[cm]?[jt]sx?$'

tracked_files() {
  git ls-files --cached --others --exclude-standard "$@" | while IFS= read -r path; do
    if [[ -e "$path" ]]; then printf '%s\n' "$path"; fi
  done
}

outside="$(tracked_files | grep -E "$suite_pattern" | grep -vE '^(__tests__|v1)/' || true)"
if [[ -n "$outside" ]]; then
  printf 'These suites are outside __tests__/; move them to __tests__/<path of the code they cover>:\n%s\n' "$outside" >&2
  exit 1
fi

collected="$(
  node_modules/.bin/vitest list --filesOnly --json |
    node -e 'let s="";process.stdin.on("data",(c)=>(s+=c)).on("end",()=>{for(const {file} of JSON.parse(s))console.log(require("node:path").relative(process.cwd(),file))})' |
    sort
)"
expected="$(
  tracked_files __tests__ |
    grep -E "$suite_pattern" |
    grep -v '^__tests__/services/sync/' |
    sort
)"
uncollected="$(comm -13 <(printf '%s\n' "$collected") <(printf '%s\n' "$expected"))"
if [[ -n "$uncollected" ]]; then
  printf 'No Vitest project in vitest.config.ts collects these suites:\n%s\n' "$uncollected" >&2
  exit 1
fi

printf '%s suites under __tests__/, all collected\n' "$(printf '%s\n' "$expected" | wc -l | tr -d ' ')"
