# Linux distribution channels

Skriuw ships to Linux through two installable repositories, both fed from a
published `desktop-v*` GitHub release:

| Channel            | Audience        | Source                                  |
| ------------------ | --------------- | --------------------------------------- |
| **apt repo**       | Debian / Ubuntu | GitHub Pages (`gh-pages` branch)        |
| **AUR `skriuw-bin`** | Arch / Manjaro | `aur.archlinux.org`                     |

The release build itself (`.deb` / `.rpm` / `.AppImage`) is produced by
[`release-desktop.yml`](../.github/workflows/release-desktop.yml). Publishing the
drafted release then triggers
[`publish-linux-repos.yml`](../.github/workflows/publish-linux-repos.yml), which
builds the apt repo and pushes the AUR package.

## Release flow

1. Tag a desktop release: `git tag desktop-v0.12.0 && git push origin desktop-v0.12.0`.
2. `release-desktop.yml` builds the bundles and creates a **draft** GitHub release.
3. Review and **publish** the release in the GitHub UI.
4. Publishing fires `publish-linux-repos.yml`:
   - downloads the `.deb`, regenerates the signed apt repo, pushes `gh-pages`;
   - bumps the PKGBUILD `pkgver` and pushes `skriuw-bin` to the AUR.

You can also run it manually: **Actions → Publish Linux Repos → Run workflow**,
passing the tag (e.g. `desktop-v0.12.0`).

## One-time setup

These workflows deliberately use the **same secret names as the `dora` repo**
(`AUR_SSH_PRIVATE_KEY`, `AUR_KNOWN_HOSTS`, `GPG_PRIVATE_KEY`) and push to the
same AUR account, so dora's existing credentials are reused as-is.

> GitHub secret *values* are write-only — they can't be read back out of dora
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

## End-user install

### Debian / Ubuntu

```bash
curl -fsSL https://remcostoeten.github.io/skriuw/apt/key.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/skriuw.gpg
echo "deb [signed-by=/usr/share/keyrings/skriuw.gpg] https://remcostoeten.github.io/skriuw/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/skriuw.list
sudo apt update && sudo apt install skriuw
```

### Arch

```bash
yay -S skriuw-bin    # or: paru -S skriuw-bin
```

## Local testing of the apt repo

```bash
./scripts/build-apt-repo.sh /tmp/skriuw-apt path/to/Skriuw_0.11.0_amd64.deb "$KEY"
# inspect /tmp/skriuw-apt/dists/stable/Release and pool/main/
```
