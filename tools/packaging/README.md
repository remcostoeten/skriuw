# Distribution channels

The current desktop release is **v2**, published from `v2-v*` GitHub tags.
Legacy v1 desktop releases use `desktop-v*` tags and are available only as
historical release assets. Package-manager publication accepts v2 tags only, so
a v1 release cannot replace the current v2 channels.

| Channel              | Audience        | Source                                         |
| -------------------- | --------------- | ---------------------------------------------- |
| **apt repo**         | Debian / Ubuntu | `skriuw/packages` (GitHub Pages)               |
| **dnf repo**         | Fedora / RHEL   | `skriuw/packages` (GitHub Pages)               |
| **AUR `skriuw-bin`** | Arch / Manjaro  | `aur.archlinux.org`                            |
| **Flatpak repo**     | any Linux       | `skriuw/flatpak` (GitHub Pages)                |
| **Nix flake**        | NixOS / Nix     | `skriuw/nix`                                   |
| **Snap**             | Ubuntu / snapd  | Snap Store (`skriuw`)                          |
| **Homebrew cask**    | macOS           | `skriuw/homebrew-tap` (`Casks/skriuw.rb`)      |
| **Winget**           | Windows         | `microsoft/winget-pkgs` (`RemcoStoeten.Skriuw`) |
| **Scoop bucket**     | Windows         | `skriuw/scoop-bucket` (`bucket/skriuw.json`)   |
| **Chocolatey**       | Windows         | `community.chocolatey.org` (`skriuw`)          |
| **Web image**        | self-hosting    | `ghcr.io/remcostoeten/skriuw-web`              |
| **AppImage**         | any Linux       | release asset (portable, no repo)              |

The iOS and Android client is a separate channel on its own version line and
is **not published**; its store metadata, privacy and export-compliance
answers, and submission checklist live in [`apps/mobile/`](../apps/mobile/README.md).

Snap and Chocolatey publish as soon as `SNAPCRAFT_STORE_CREDENTIALS` and
`CHOCOLATEY_API_KEY` exist. Until then their jobs build and test the package and
skip the upload, so do not advertise either channel before its first successful
publish. Winget installs the MSI, which is a per-machine install.

The release builds (`.deb` / `.rpm` / `.AppImage` / universal `.dmg` / NSIS
`-setup.exe`) are produced by
[`release-v2.yml`](../.github/workflows/release-v2.yml). Publishing the drafted
release then triggers
[`publish-linux-repos.yml`](../.github/workflows/publish-linux-repos.yml)
("Publish Channels"), which updates the available channels above and attempts
the optional store submissions.

## Release flow

1. Tag a v2 desktop release: `git tag v2-v0.27.0 && git push origin v2-v0.27.0`.
2. `release-v2.yml` creates a **draft** GitHub release, then builds Linux,
   macOS, and Windows in parallel and attaches the artifacts.
3. Review and **publish** the release in the GitHub UI.
4. Publishing fires `publish-linux-repos.yml`:
    - downloads the `.deb` + `.rpm`, regenerates the signed apt and dnf repos
      (keeping the newest three versions), and force-pushes them as a single
      commit to `skriuw/packages`;
    - bumps the PKGBUILD `pkgver` and pushes `skriuw-bin` to the AUR;
    - rewrites `Casks/skriuw.rb` on `skriuw/homebrew-tap` (from the `.dmg`) and
      `bucket/skriuw.json` on `skriuw/scoop-bucket` (from the `-setup.exe`);
    - submits a winget version PR only when `WINGET_TOKEN` is configured;
    - repacks the `.deb` as a snap and uploads it only when
      `SNAPCRAFT_STORE_CREDENTIALS` is configured.

Publishing the release also fires four independent workflows, each with its own
pull-request build and a `workflow_dispatch` that takes a tag:

- `publish-flatpak.yml` builds the Flatpak from the `.deb` and publishes the
  signed OSTree repo to `skriuw/flatpak`;
- `publish-nix.yml` rewrites `release.json` in `skriuw/nix`, builds the flake,
  and pushes;
- `publish-chocolatey.yml` packs the MSI package, test-installs it, and pushes it
  when `CHOCOLATEY_API_KEY` is set;
- `publish-container.yml` builds the browser app into a multi-arch image and
  pushes it to GHCR.

You can also run the main workflow manually: **Actions → Publish Channels → Run
workflow**, passing the tag (e.g. `v2-v0.27.0`).

## One-time setup

These workflows deliberately use the **same secret names as the `dora` repo**
(`AUR_SSH_PRIVATE_KEY`, `AUR_KNOWN_HOSTS`, `GPG_PRIVATE_KEY`) and push to the
same AUR account, so dora's existing credentials are reused as-is.

> GitHub secret _values_ are write-only — they can't be read back out of dora
> and copied here through the API. You have to add the same values to this repo
> once. If you still have the originals locally, set them with `gh`:
>
> ```bash
> gh secret set AUR_SSH_PRIVATE_KEY --repo remcostoeten/skriuw < /path/to/aur_key
> printf '%s\n' "$(ssh-keyscan aur.archlinux.org 2>/dev/null)" \
>   | gh secret set AUR_KNOWN_HOSTS --repo remcostoeten/skriuw
> gh secret set GPG_PRIVATE_KEY --repo remcostoeten/skriuw < /path/to/apt_signing_key.asc
> ```

### 1. GitHub Pages — `PACKAGES_DEPLOY_KEY`

[`skriuw/packages`](https://github.com/skriuw/packages) serves the apt and dnf
repos at `https://skriuw.github.io/packages/` from its `main` branch. The apt
job pushes to it with `PACKAGES_DEPLOY_KEY`, the private half of a
write-enabled deploy key on that repository; rotate it like the keys in
step 4.

### 2. apt signing key — `GPG_PRIVATE_KEY` (+ optional `GPG_PASSPHRASE`)

Reuse dora's `GPG_PRIVATE_KEY`. To make a fresh one instead:

```bash
gpg --batch --gen-key <<EOF
%no-protection
Key-Type: eddsa
Key-Curve: ed25519
Name-Real: Skriuw apt repo
Name-Email: remcostoeten@hotmail.com
Expire-Date: 0
%commit
EOF

KEY=$(gpg --list-secret-keys --with-colons | awk -F: '/^sec:/{print $5; exit}')
gpg --armor --export-secret-keys "$KEY" | gh secret set GPG_PRIVATE_KEY --repo remcostoeten/skriuw
```

### 3. AUR — `AUR_SSH_PRIVATE_KEY` + `AUR_KNOWN_HOSTS`

Reuse dora's two AUR secrets. The job clones
`ssh://aur@aur.archlinux.org/skriuw-bin.git`; the first push creates the
`skriuw-bin` package on your AUR account, later pushes update it.

### 4. Homebrew — `TAP_DEPLOY_KEY`; Scoop — `BUCKET_DEPLOY_KEY`; dnf repo — no secrets

The Homebrew cask (`Casks/skriuw.rb`) lives in
[`skriuw/homebrew-tap`](https://github.com/skriuw/homebrew-tap) and the Scoop
manifest (`bucket/skriuw.json`) in
[`skriuw/scoop-bucket`](https://github.com/skriuw/scoop-bucket). Deploy keys
are scoped to one repository, so the manifests job pushes with two secrets:
`TAP_DEPLOY_KEY` and `BUCKET_DEPLOY_KEY`, each the private half of a
write-enabled deploy key on its repository. To rotate one, generate a new
ed25519 pair, replace the deploy key on that repository, and
`gh secret set <NAME> --repo remcostoeten/skriuw < key`. The root
`tap_migrations.json` moves users of the old tap-by-URL to `skriuw/tap`. The
dnf repo reuses the apt repo's `GPG_PRIVATE_KEY` (it signs
`repodata/repomd.xml` the way apt signs `Release`).

#### Homebrew details

The `.dmg` is unsigned, so the
cask strips the quarantine attribute on install; adding an Apple Developer
cert later only requires signing in `release-v2.yml`.

### 5. winget — `WINGET_TOKEN`

- Create a **classic** PAT with the `public_repo` and `workflow` scopes
  (`tools/scripts/setup-package-credentials.sh winget` does this and stores the
  secret) and fork
  [`microsoft/winget-pkgs`](https://github.com/microsoft/winget-pkgs) under
  the account that owns (or can write to) `remcostoeten/winget-pkgs`.
- `gh secret set WINGET_TOKEN --repo remcostoeten/skriuw`
- The **first version must be submitted by hand** (winget requires the
  `RemcoStoeten.Skriuw` identifier to exist before automation can update it):
  `wingetcreate new https://github.com/remcostoeten/skriuw/releases/download/v2-vX.Y.Z/Skriuw_X.Y.Z_x64-setup.exe`

The workflow fails early when `public_repo` or fork write access is missing and
warns when `workflow` is missing. The `workflow` scope matters because komac syncs
the fork with upstream first, and GitHub refuses to merge upstream commits that
change `.github/workflows` into a fork without it; a token without it works until
upstream next touches a workflow file.

### 6. Snap Store — `SNAPCRAFT_STORE_CREDENTIALS`

- One-time: `tools/scripts/setup-package-credentials.sh snap` logs in to
  snapcraft.io (free account), registers `skriuw`, and stores the exported
  credentials as `SNAPCRAFT_STORE_CREDENTIALS`.
- Until the secret exists the job still builds the snap as a dry run, it just
  skips the store upload.

### 7. Flatpak and Nix repositories — `FLATPAK_DEPLOY_KEY`, `NIX_DEPLOY_KEY`

[`skriuw/flatpak`](https://github.com/skriuw/flatpak) serves the OSTree repo from
GitHub Pages and [`skriuw/nix`](https://github.com/skriuw/nix) holds the flake.
Each has a write-enabled deploy key whose private half is the matching secret,
rotated the way the keys in step 4 are. The Flatpak repo is signed with the same
`GPG_PRIVATE_KEY` as apt and dnf. Every release replaces the Flatpak repo with a
single commit, so it carries no history.

The Flatpak wraps the released `.deb` under the app ID `com.skriuw.Skriuw`.
Flathub requires open-source apps to build from source offline, so a Flathub
submission is a separate piece of work from this self-hosted remote.

### 8. Chocolatey — `CHOCOLATEY_API_KEY`

Create a free account on community.chocolatey.org and run
`tools/scripts/setup-package-credentials.sh chocolatey` to store the API key. The
first push of a package enters Chocolatey's moderation queue, and so does every
version after it.

## End-user install

### Debian / Ubuntu

```bash
curl -fsSL https://skriuw.github.io/packages/apt/key.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/skriuw.gpg
echo "deb [signed-by=/usr/share/keyrings/skriuw.gpg] https://skriuw.github.io/packages/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/skriuw.list
sudo apt update && sudo apt install skriuw
```

### Fedora / RHEL

```bash
sudo dnf config-manager addrepo --from-repofile=https://skriuw.github.io/packages/rpm/skriuw.repo
sudo dnf install skriuw
```

### Arch

```bash
yay -S skriuw-bin    # or: paru -S skriuw-bin
```

### macOS

```bash
brew install --cask skriuw/tap/skriuw
```

### Windows

```powershell
winget install RemcoStoeten.Skriuw
```

```powershell
scoop bucket add skriuw https://github.com/skriuw/scoop-bucket
scoop install skriuw
```

```powershell
choco install skriuw
```

The `choco` line works once Chocolatey has approved the first version.

### Any Linux (Flatpak)

```bash
flatpak remote-add --if-not-exists --user skriuw https://skriuw.github.io/flatpak/skriuw.flatpakrepo
flatpak install --user skriuw com.skriuw.Skriuw
```

### Nix

```bash
nix run github:skriuw/nix
```

### Snap

```bash
sudo snap install skriuw
```

The `snap` line works once the snap is registered and the credentials secret
exists.

Install from [GitHub Releases](https://github.com/remcostoeten/skriuw/releases/latest) if none of the channels above fits your platform.

## Docker (v1 self-hosting)

The v1 web image is frozen at `0.25.0` and no longer rebuilt. It stays
available for `linux/amd64` and `linux/arm64`:

```bash
docker pull ghcr.io/remcostoeten/skriuw:0.25.0
```

## Docker (v2 browser app)

The browser build of v2 is published as a static-file image for `linux/amd64` and
`linux/arm64`:

```bash
docker run --rm -p 8080:80 ghcr.io/remcostoeten/skriuw-web:latest
```

The image is a Caddy server over `apps/workspace/dist`, built by
[`Dockerfile`](docker/Dockerfile). It is a separate package from the frozen v1
image, so a v1 `:latest` pull never turns into v2.

- The app needs a secure context for its service worker and local database.
  `http://localhost` works. Anything else needs HTTPS, so set `SITE_ADDRESS` to a
  domain and publish ports 80 and 443 for Caddy's automatic HTTPS, or terminate
  TLS in front of the container.
- The build has no sync backend of its own. The sync service is a Cloudflare
  Worker, and the app only trusts cloud URLs on `.skriuw.app` and `.workers.dev`.
  Sign-in therefore talks to the hosted Skriuw cloud and stays off until a user
  connects it.
- [`compose.yaml`](docker/compose.yaml) is a minimal Compose file for the same
  image.
- After the first push, the package visibility on GHCR has to be set to Public
  once in the package settings. The publish workflow warns when it is not.

The desktop application is not distributed as a server container.

## Local testing of the apt repo

```bash
./tools/scripts/build-apt-repo.sh /tmp/skriuw-apt path/to/Skriuw_0.11.0_amd64.deb "$KEY"
# inspect /tmp/skriuw-apt/dists/stable/Release and pool/main/
```
