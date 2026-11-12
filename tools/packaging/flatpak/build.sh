#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 5 ]]; then
  echo "usage: build.sh <version> <deb-url> <deb-sha256> <release-date> <out-dir> [gpg-key-id]" >&2
  exit 2
fi

version="$1"
deb_url="$2"
deb_sha256="$3"
release_date="$4"
out_dir="$(mkdir -p "$5" && cd "$5" && pwd)"
gpg_key="${6:-}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_id="com.skriuw.Skriuw"
pages_url="https://skriuw.github.io/flatpak"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

sed -e "s|@VERSION@|${version}|g" -e "s|@DATE@|${release_date}|g" \
  "$here/${app_id}.metainfo.xml" > "$work/${app_id}.metainfo.xml"
sed -e "s|@DEB_URL@|${deb_url}|g" -e "s|@DEB_SHA256@|${deb_sha256}|g" \
  "$here/${app_id}.yaml" > "$work/${app_id}.yaml"

flatpak remote-add --system --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

sign_args=()
if [[ -n "$gpg_key" ]]; then
  sign_args+=("--gpg-sign=${gpg_key}")
  [[ -n "${GNUPGHOME:-}" ]] && sign_args+=("--gpg-homedir=${GNUPGHOME}")
fi

cd "$work"
flatpak-builder --force-clean --disable-rofiles-fuse --install-deps-from=flathub \
  --default-branch=stable --subject="Skriuw ${version}" \
  --repo="${out_dir}/repo" "${sign_args[@]}" build "${app_id}.yaml"

flatpak-builder --run build "${app_id}.yaml" sh -c '
  missing="$(ldd /app/bin/skriuw-app | grep "not found" || true)"
  if [ -n "$missing" ]; then echo "$missing" >&2; exit 1; fi
  appstreamcli validate --no-net /app/share/metainfo/com.skriuw.Skriuw.metainfo.xml || true
'

flatpak build-update-repo --generate-static-deltas --prune --prune-depth=2 \
  --title=Skriuw --default-branch=stable "${sign_args[@]}" "${out_dir}/repo"

gpg_block=""
if [[ -n "$gpg_key" ]]; then
  gpg_block="$(gpg ${GNUPGHOME:+--homedir "$GNUPGHOME"} --export "$gpg_key" | base64 -w0)"
fi

cat > "${out_dir}/skriuw.flatpakrepo" <<REPO
[Flatpak Repo]
Title=Skriuw
Url=${pages_url}/repo/
Homepage=https://skriuw.com
Comment=Skriuw, a quiet writing workspace
DefaultBranch=stable
GPGKey=${gpg_block}
REPO

cat > "${out_dir}/${app_id}.flatpakref" <<REF
[Flatpak Ref]
Title=Skriuw
Name=${app_id}
Branch=stable
Url=${pages_url}/repo/
IsRuntime=false
SuggestRemoteName=skriuw
RuntimeRepo=https://dl.flathub.org/repo/flathub.flatpakrepo
GPGKey=${gpg_block}
REF

touch "${out_dir}/.nojekyll"
