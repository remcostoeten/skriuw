#!/usr/bin/env bash
#
# Build (or update) a signed dnf/yum repository tree from a .rpm file.
#
# The repo is laid out under <repo-dir> so it can be served statically (e.g.
# GitHub Pages). Existing .rpm files already present are preserved and
# re-indexed, so running this once per release accumulates every version.
#
# The rpms themselves are unsigned (gpgcheck=0); integrity comes from the
# detached signature on repodata/repomd.xml (repo_gpgcheck=1), same trust
# model as the apt repo's signed Release file.
#
# Usage:
#   build-rpm-repo.sh <repo-dir> <rpm-file> [gpg-key-id]
#
# Env (all optional):
#   BASE_URL  public URL the repo is served from
#             (default: https://remcostoeten.github.io/skriuw/rpm)
#
# Requires: createrepo-c, gpg.
set -euo pipefail

REPO_DIR="${1:?usage: build-rpm-repo.sh <repo-dir> <rpm-file> [gpg-key-id]}"
RPM_FILE="${2:?missing <rpm-file>}"
GPG_KEY_ID="${3:-}"

BASE_URL="${BASE_URL:-https://remcostoeten.github.io/skriuw/rpm}"

mkdir -p "${REPO_DIR}"
cp -f "${RPM_FILE}" "${REPO_DIR}/"

createrepo_c --update "${REPO_DIR}"

if [ -n "${GPG_KEY_ID}" ]; then
    rm -f "${REPO_DIR}/repodata/repomd.xml.asc"
    gpg --batch --yes --default-key "${GPG_KEY_ID}" \
        --detach-sign --armor "${REPO_DIR}/repodata/repomd.xml"
    gpg --armor --export "${GPG_KEY_ID}" > "${REPO_DIR}/key.gpg"
else
    echo "warning: no GPG key id supplied — repomd.xml is UNSIGNED" >&2
fi

cat > "${REPO_DIR}/skriuw.repo" <<REPOFILE
[skriuw]
name=Skriuw
baseurl=${BASE_URL}
enabled=1
gpgcheck=0
repo_gpgcheck=1
gpgkey=${BASE_URL}/key.gpg
REPOFILE

echo "rpm repo built at ${REPO_DIR}"
