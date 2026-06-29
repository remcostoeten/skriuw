#!/usr/bin/env bash
#
# Build (or update) a signed apt repository tree from a .deb file.
#
# The repo is laid out under <repo-dir> so it can be served statically (e.g.
# GitHub Pages). Existing packages already present in the pool are preserved and
# re-indexed, so running this once per release accumulates every version.
#
# Usage:
#   build-apt-repo.sh <repo-dir> <deb-file> [gpg-key-id]
#
# Env (all optional):
#   DIST  apt suite/codename       (default: stable)
#   COMP  apt component            (default: main)
#   ARCH  debian architecture      (default: amd64)
#
# Requires: dpkg-dev (dpkg-scanpackages), apt-utils (apt-ftparchive), gpg, gzip.
set -euo pipefail

REPO_DIR="${1:?usage: build-apt-repo.sh <repo-dir> <deb-file> [gpg-key-id]}"
DEB_FILE="${2:?missing <deb-file>}"
GPG_KEY_ID="${3:-}"

DIST="${DIST:-stable}"
COMP="${COMP:-main}"
ARCH="${ARCH:-amd64}"

POOL_DIR="${REPO_DIR}/pool/${COMP}"
DIST_DIR="${REPO_DIR}/dists/${DIST}"
BIN_DIR="${DIST_DIR}/${COMP}/binary-${ARCH}"

mkdir -p "${POOL_DIR}" "${BIN_DIR}"
cp -f "${DEB_FILE}" "${POOL_DIR}/"

cd "${REPO_DIR}"

dpkg-scanpackages --multiversion --arch "${ARCH}" pool > "${BIN_DIR}/Packages"
gzip -9kf "${BIN_DIR}/Packages"

apt-ftparchive \
    -o "APT::FTPArchive::Release::Origin=Skriuw" \
    -o "APT::FTPArchive::Release::Label=Skriuw" \
    -o "APT::FTPArchive::Release::Suite=${DIST}" \
    -o "APT::FTPArchive::Release::Codename=${DIST}" \
    -o "APT::FTPArchive::Release::Architectures=${ARCH}" \
    -o "APT::FTPArchive::Release::Components=${COMP}" \
    -o "APT::FTPArchive::Release::Description=Skriuw desktop apt repository" \
    release "${DIST_DIR}" > "${DIST_DIR}/Release"

if [ -n "${GPG_KEY_ID}" ]; then
    rm -f "${DIST_DIR}/Release.gpg" "${DIST_DIR}/InRelease"
    gpg --batch --yes --default-key "${GPG_KEY_ID}" \
        -abs -o "${DIST_DIR}/Release.gpg" "${DIST_DIR}/Release"
    gpg --batch --yes --default-key "${GPG_KEY_ID}" \
        --clearsign -o "${DIST_DIR}/InRelease" "${DIST_DIR}/Release"
    gpg --armor --export "${GPG_KEY_ID}" > "${REPO_DIR}/key.gpg"
else
    echo "warning: no GPG key id supplied — repo is UNSIGNED (apt will refuse it by default)" >&2
fi

echo "apt repo built at ${REPO_DIR} (dist=${DIST} comp=${COMP} arch=${ARCH})"
