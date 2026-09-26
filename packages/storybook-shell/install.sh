#!/usr/bin/env bash
set -Eeuo pipefail

repo="${STORYBOOK_SHELL_REPO:-remcostoeten/skriuw}"
ref="${STORYBOOK_SHELL_REF:-daddy}"
package_path="packages/storybook-shell"

for tool in bun curl tar; do
  command -v "$tool" >/dev/null || { printf '%s is required\n' "$tool" >&2; exit 1; }
done

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

printf 'Fetching %s from %s@%s\n' "$package_path" "$repo" "$ref"
if ! curl -fsSL "${STORYBOOK_SHELL_TARBALL:-https://api.github.com/repos/$repo/tarball/$ref}" -o "$work_dir/source.tgz" \
  || ! tar -xzf "$work_dir/source.tgz" -C "$work_dir" --wildcards "*/$package_path/*" 2>/dev/null; then
  printf 'No %s at %s@%s (unknown ref, or the package is not on that ref yet)\n' "$package_path" "$repo" "$ref" >&2
  exit 1
fi

roots=("$work_dir"/*/)
root_name="$(basename "${roots[0]}")"

STORYBOOK_SHELL_REPO="$repo" STORYBOOK_SHELL_REF="$ref" STORYBOOK_SHELL_SHA="${root_name##*-}" \
  bun "$work_dir/$root_name/$package_path/install.ts" "${@:-.}"
