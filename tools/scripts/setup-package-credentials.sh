#!/usr/bin/env bash
set -Eeuo pipefail

repo="${SKRIUW_REPO:-remcostoeten/skriuw}"

usage() {
  printf 'Usage: %s <winget|chocolatey|snap>\n' "$(basename "$0")" >&2
  exit 2
}

require() {
  command -v "$1" >/dev/null 2>&1 || { printf '%s is required\n' "$1" >&2; exit 1; }
}

open_url() {
  printf 'Open: %s\n' "$1"
  command -v xdg-open >/dev/null 2>&1 && xdg-open "$1" >/dev/null 2>&1 || true
}

read_secret() {
  local value
  read -rsp "$1: " value
  printf '\n' >&2
  [[ -n "$value" ]] || { printf 'empty value\n' >&2; exit 1; }
  printf '%s' "$value"
}

require gh
[[ $# -eq 1 ]] || usage

case "$1" in
  winget)
    open_url "https://github.com/settings/tokens/new?scopes=public_repo,workflow&description=skriuw-winget"
    read_secret "Paste the classic token (public_repo + workflow)" | gh secret set WINGET_TOKEN --repo "$repo"
    ;;
  chocolatey)
    open_url "https://community.chocolatey.org/account"
    read_secret "Paste the Chocolatey API key" | gh secret set CHOCOLATEY_API_KEY --repo "$repo"
    ;;
  snap)
    require snapcraft
    snapcraft login
    snapcraft register skriuw
    snapcraft export-login --snaps skriuw --channels stable \
      --acls package_access,package_push,package_update,package_release - \
      | gh secret set SNAPCRAFT_STORE_CREDENTIALS --repo "$repo"
    ;;
  *) usage ;;
esac

printf 'Secret stored on %s.\n' "$repo"
