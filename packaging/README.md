# Distribution channels

Skriuw ships through six install channels, all fed from a published
`desktop-v*` GitHub release:

| Channel              | Audience        | Source                                      |
| -------------------- | --------------- | ------------------------------------------- |
| **apt repo**         | Debian / Ubuntu | GitHub Pages (`gh-pages` branch)            |
| **dnf repo**         | Fedora / RHEL   | GitHub Pages (`gh-pages` branch)            |
| **AUR `skriuw-bin`** | Arch / Manjaro  | `aur.archlinux.org`                         |
| **Homebrew cask**    | macOS           | `Casks/skriuw.rb` in this repo (tap by URL) |
| **Scoop bucket**     | Windows         | `bucket/skriuw.json` in this repo           |
| **winget**           | Windows         | PR to `microsoft/winget-pkgs`               |
| **Snap Store**       | any Linux       | snapcraft.io (repacked `.deb`)              |
| **AppImage**         | any Linux       | release asset (portable, no repo)           |

The release builds (`.deb` / `.rpm` / `.AppImage` / universal `.dmg` / NSIS
`-setup.exe`) are produced by
[`release-desktop.yml`](../.github/workflows/release-desktop.yml). Publishing the
drafted release then triggers
[`publish-linux-repos.yml`](../.github/workflows/publish-linux-repos.yml)
("Publish Channels"), which fans out to every channel above.

## Release flow

1. Tag a desktop release: `git tag desktop-v0.12.0 && git push origin desktop-v0.12.0`.
2. `release-desktop.yml` creates a **draft** GitHub release with generated
   notes (`scripts/generate-release-notes.sh` diffs against the previous
   desktop tag and groups commits by conventional-commit type), then builds
   Linux, macOS, and Windows in parallel and attaches the artifacts.
3. Review and **publish** the release in the GitHub UI.
4. Publishing fires `publish-linux-repos.yml`:
    - downloads the `.deb` + `.rpm`, regenerates the signed apt and dnf repos,
      pushes `gh-pages`;
    - bumps the PKGBUILD `pkgver` and pushes `skriuw-bin` to the AUR;
    - rewrites `Casks/skriuw.rb` (from the `.dmg`) and `bucket/skriuw.json`
      (from the `-setup.exe`) in one commit on `daddy`;
    - opens a winget version PR against `microsoft/winget-pkgs`;
    - repacks the `.deb` as a snap and uploads it to the Snap Store.

You can also run it manually: **Actions → Publish Channels → Run workflow**,
passing the tag (e.g. `desktop-v0.12.0`).

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

### 1. GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → branch `gh-pages` / root.
(The branch is created automatically by the first publish run.)

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

### 4. Homebrew + Scoop + dnf repo — no secrets

The Homebrew cask (`Casks/skriuw.rb`) and Scoop bucket (`bucket/skriuw.json`)
live in this repo and are updated with the built-in `GITHUB_TOKEN`. The dnf
repo reuses the apt repo's `GPG_PRIVATE_KEY` (it signs `repodata/repomd.xml`
the way apt signs `Release`). Nothing to configure.

#### Homebrew details

The cask lives at `Casks/skriuw.rb` in this repo and is updated with the
built-in `GITHUB_TOKEN`. Nothing to configure. The `.dmg` is unsigned, so the
cask strips the quarantine attribute on install; adding an Apple Developer
cert later only requires signing in `release-desktop.yml`.

### 5. winget — `WINGET_TOKEN`

- Create a **classic** PAT with the `public_repo` scope and fork
  [`microsoft/winget-pkgs`](https://github.com/microsoft/winget-pkgs) under
  the same account.
- `gh secret set WINGET_TOKEN --repo remcostoeten/skriuw`
- The **first version must be submitted by hand** (winget requires the
  `RemcoStoeten.Skriuw` identifier to exist before automation can update it):
  `wingetcreate new https://github.com/remcostoeten/skriuw/releases/download/desktop-vX.Y.Z/Skriuw_X.Y.Z_x64-setup.exe`

### 6. Snap Store — `SNAPCRAFT_STORE_CREDENTIALS`

- One-time: `snapcraft register skriuw` (requires a snapcraft.io account).
- `snapcraft export-login --snaps skriuw --channels stable - | gh secret set SNAPCRAFT_STORE_CREDENTIALS --repo remcostoeten/skriuw`
- Until the secret exists the job still builds the snap as a dry run, it just
  skips the store upload.

## End-user install

### Debian / Ubuntu

```bash
curl -fsSL https://remcostoeten.github.io/skriuw/apt/key.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/skriuw.gpg
echo "deb [signed-by=/usr/share/keyrings/skriuw.gpg] https://remcostoeten.github.io/skriuw/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/skriuw.list
sudo apt update && sudo apt install skriuw
```

### Fedora / RHEL / openSUSE

```bash
sudo dnf config-manager addrepo --from-repofile=https://remcostoeten.github.io/skriuw/rpm/skriuw.repo
sudo dnf install skriuw
```

### Arch

```bash
yay -S skriuw-bin    # or: paru -S skriuw-bin
```

### macOS

```bash
brew tap remcostoeten/skriuw https://github.com/remcostoeten/skriuw
brew install --cask skriuw
```

### Windows

```powershell
winget install RemcoStoeten.Skriuw
# or via Scoop:
scoop bucket add skriuw https://github.com/remcostoeten/skriuw
scoop install skriuw
```

### Snap (any Linux)

```bash
sudo snap install skriuw
```

## Local testing of the apt repo

```bash
./scripts/build-apt-repo.sh /tmp/skriuw-apt path/to/Skriuw_0.11.0_amd64.deb "$KEY"
# inspect /tmp/skriuw-apt/dists/stable/Release and pool/main/
```
