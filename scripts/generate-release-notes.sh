#!/usr/bin/env bash
# Generates release notes for a desktop tag by diffing it against the previous
# desktop-v* tag. Commits are scoped to paths that affect the desktop build,
# grouped by conventional-commit type, and followed by an install matrix and a
# full-changelog compare link. Notes are written to stdout.
#
# Usage: generate-release-notes.sh <tag> <owner/repo>
set -euo pipefail

TAG="${1:?usage: generate-release-notes.sh <tag> <owner/repo>}"
REPO="${2:?usage: generate-release-notes.sh <tag> <owner/repo>}"
VERSION="${TAG#desktop-v}"

PATHS=(apps/desktop packages/web-spa .github/workflows/release-desktop.yml .github/workflows/publish-linux-repos.yml)
PREV="$(git describe --tags --abbrev=0 --match 'desktop-v*' "${TAG}^" 2>/dev/null || true)"
if [ -n "$PREV" ]; then RANGE="${PREV}..${TAG}"; else RANGE="$TAG"; fi

# One "subject<US>hash" line per commit; the unit separator keeps subjects with
# pipes or tabs intact.
US=$'\x1f'
COMMITS="$(git log --no-merges --pretty=format:"%s${US}%h" "$RANGE" -- "${PATHS[@]}" | sed '/^$/d')"

function section() {
    local title="$1" pattern="$2"
    local body
    body="$(printf '%s\n' "$COMMITS" \
        | grep -E "$pattern" \
        | sed -E "s/^[a-z]+(\([^)]*\))?!?:[[:space:]]*//" \
        | awk -F "$US" '{ printf "- %s (%s)\n", $1, $2 }')" || true
    if [ -n "$body" ]; then
        printf '### %s\n\n%s\n\n' "$title" "$body"
    fi
}

echo "## What's changed"
echo ""

if [ -z "$COMMITS" ]; then
    printf 'Maintenance release — no desktop-facing commits since %s.\n\n' "${PREV:-the beginning}"
fi

section "Breaking" '^[a-z]+(\([^)]*\))?!:'
section "New" '^feat(\([^)]*\))?:'
section "Fixed" '^fix(\([^)]*\))?:'
section "Performance" '^perf(\([^)]*\))?:'

# grep -E has no lookahead; select "other" by excluding the typed prefixes.
OTHER="$(printf '%s\n' "$COMMITS" \
    | sed '/^$/d' \
    | grep -Ev '^(feat|fix|perf)(\([^)]*\))?!?:' \
    | awk -F "$US" '{ printf "- %s (%s)\n", $1, $2 }')" || true
if [ -n "$OTHER" ]; then
    printf '### Other\n\n%s\n\n' "$OTHER"
fi

cat <<INSTALL
### Install

| Platform | Command |
| --- | --- |
| macOS (Homebrew) | \`brew tap remcostoeten/skriuw https://github.com/${REPO} && brew install --cask skriuw\` |
| Windows (winget) | \`winget install RemcoStoeten.Skriuw\` |
| Windows (Scoop) | \`scoop bucket add skriuw https://github.com/${REPO} && scoop install skriuw\` |
| Arch Linux (AUR) | \`yay -S skriuw-bin\` |
| Debian/Ubuntu (apt) | one-time repo setup: https://remcostoeten.github.io/skriuw |
| Fedora/RHEL (dnf) | one-time repo setup: https://remcostoeten.github.io/skriuw |
| Snap | \`sudo snap install skriuw\` |
| Any distro (portable) | download the \`.AppImage\` below, \`chmod +x\` it, and run |

INSTALL

if [ -n "$PREV" ]; then
    echo "**Full changelog**: https://github.com/${REPO}/compare/${PREV}...${TAG}"
fi
