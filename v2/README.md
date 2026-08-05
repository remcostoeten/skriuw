# Skriuw v2

Skriuw v2 is the current, fully released Skriuw desktop application: a local-first notes app with a Rust backend, React renderer, and Tauri shell. It is distinct from [v1](../README.md#v1-legacy-web-mobile-and-self-hosted), which provides the legacy web, mobile, cloud, and self-hosted product.

## Current decisions

- SQLite is canonical storage.
- UI navigation will read a fully hydrated in-memory workspace.
- UI actions become versioned `WorkspaceOperation` messages.
- Persistence adapters stay behind one small contract.
- Native desktop ships first. Browser-local storage remains possible later.
- Git history runs asynchronously and never blocks editing or navigation.

See [FEATURES.md](FEATURES.md) for what the app does, [ARCHITECTURE.md](ARCHITECTURE.md) for how it is built, and [docs/adr](docs/adr) for why.

## Installation

The [latest GitHub release](https://github.com/remcostoeten/skriuw/releases/latest) is always the current v2 release and provides installers for macOS, Windows, and Linux. v2 release tags use the `v2-v*` format.

### Debian / Ubuntu (APT)

Use the repository for automatic updates:
```bash
curl -fsSL https://remcostoeten.github.io/skriuw/apt/key.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/skriuw.gpg
echo "deb [signed-by=/usr/share/keyrings/skriuw.gpg] https://remcostoeten.github.io/skriuw/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/skriuw.list
sudo apt update && sudo apt install skriuw
```

To install a single `.deb`, download it from the [latest release](https://github.com/remcostoeten/skriuw/releases/latest) and run `sudo apt install ./Skriuw_*_amd64.deb`.

### Fedora / RHEL / openSUSE (dnf)

```bash
sudo dnf config-manager addrepo --from-repofile=https://remcostoeten.github.io/skriuw/rpm/skriuw.repo
sudo dnf install skriuw
```

### macOS (Homebrew)
```bash
brew tap remcostoeten/skriuw https://github.com/remcostoeten/skriuw
brew install --cask skriuw
```

### Windows (Scoop)
```powershell
scoop bucket add skriuw https://github.com/remcostoeten/skriuw
scoop install skriuw
```

### Arch Linux (AUR)
```bash
yay -S skriuw-bin
```

### Direct downloads

The latest release includes `.dmg` (macOS), NSIS `.exe` and `.msi` (Windows), `.deb`, `.rpm`, and AppImage (Linux) assets. Download the right one from [GitHub Releases](https://github.com/remcostoeten/skriuw/releases/latest).

### Package-manager status

The current v2 release is published through apt, dnf, Homebrew, Scoop, and AUR. Winget and the Snap Store are wired into the release automation but do not yet have a current v2 publication; use a release asset or one of the listed channels instead. These package channels install v2, not v1.

## Requirements

- Rust 1.95.0. `rust-toolchain.toml` installs required components through rustup.
- Bun 1.3 and Node.js 24. Bun installs dependencies and runs package scripts; Node runs the renderer test suite.
- Bash.

## Bootstrap

```bash
./scripts/bootstrap.sh
```

## Common commands

```bash
./scripts/build.sh
./scripts/build.sh web
./scripts/build.sh desktop
./scripts/build.sh ci
./scripts/check.sh
./scripts/check-wasm.sh
./scripts/generate.sh
bun --cwd cloud run check
./scripts/dev-db.sh
cargo run -p skriuw-cli -- snapshot .data/skriuw.db
cargo run -p skriuw-cli -- integrity .data/skriuw.db
cargo run -p skriuw-cli -- export .data/skriuw.db workspace.json
cargo run -p skriuw-cli -- backup .data/skriuw.db workspace.backup.db
cargo run -p skriuw-cli -- restore workspace.backup.db restored.db
```

`check-wasm.sh` is the portability and browser-durability gate. It compiles the
backend-neutral domain/storage crates and the browser adapter, generates the
version-matched WASM module, then proves in headless Chromium that a write made
through the application bridge survives worker close and page reload in OPFS.
Native Git, lifecycle, CLI, and Tauri crates remain outside the browser runtime.

Every build entry point runs generated-contract checks, Rust formatting and linting, all default backend, desktop, renderer, renderer-store, and UI-architecture tests, executed-source renderer coverage, and TypeScript validation before producing artifacts. `bun run build`, `bun run tauri:build`, and `bun run check` route through the same orchestrator. Successful local builds print terminal links to their artifacts; CI uploads the release binaries, renderer bundle, and complete logs.

`import <database> <archive.json>` validates the portable archive and creates a timestamped safety backup before transactional replacement. Backup, restore, and export refuse to overwrite existing targets.

`generate.sh` creates JSON Schema contracts from Rust domain types. Generated files are committed and checked for drift.

## Optional cloud sync

The Account settings section loads the auth UI on demand, so authentication and
sync are not part of local workspace startup. Desktop users can sign in and
explicitly choose **Enable sync**. Skriuw then provisions one private cloud
workspace for the account, registers this installation as a device, and starts
the existing durable push/pull coordinator. Later launches resume it from the
OS credential vault on a background thread, without delaying local startup.
Signing out or choosing **Pause
sync** stops network work and drops the in-memory credential without deleting
the local database or its pending outbox.

On first connection, Skriuw transactionally queues the existing inline notes,
folders, tags, people, properties, templates, pins, and trash state before it
starts sending later edits. Media, covers, oversized-document chunks,
checkpoints, sharing, and account deletion are still pre-beta work. The hosted
browser build remains fully local in OPFS; account-backed workspace sync is
currently desktop-only.

For development, start the Worker in `cloud/` after applying its D1 migrations
and creating `.dev.vars` from `.dev.vars.example`. Debug desktop builds use
`http://localhost:8787`; release desktop builds use the production Worker.

The production web app is served from `https://skriuw.com/app` and connects by
default to `https://skriuw-v2-cloud.remcostoeten.workers.dev`. The Vite build
uses relative asset paths, so the output can be mounted below `/app`. Build it
with:

```bash
./scripts/build.sh web
```

Set `VITE_SKRIUW_CLOUD_URL` only to override the default Worker at build time.
Desktop bearer sessions are stored in the operating-system credential vault.

## Layout

```text
crates/skriuw-domain       Data and operation protocol; no I/O
crates/skriuw-storage      Storage port
crates/skriuw-sqlite       Native SQLite adapter
crates/skriuw-runtime      Serialized backend worker and request queue
crates/skriuw-history      Portable leased history worker
crates/skriuw-history-git  Native Git history adapter
crates/skriuw-images       Note image decoding and storage
crates/skriuw-lifecycle    Startup, shutdown, and backup rotation
crates/skriuw-fixtures     Deterministic scale fixtures
crates/skriuw-cli          Database development utility
cloud                      v2-only internal cloud sync service
app                        React renderer and Tauri desktop shell
spikes                     Retained measurement harnesses run by the build
xtask                      Repository automation and contract generation
migrations                 Ordered SQL migrations
contracts/generated        Generated JSON Schema
docs/adr                   Architecture decision records
scripts                    Stable contributor/CI entrypoints
```

## Status

v2 is the current desktop release. See [FEATURES.md](FEATURES.md) for its shipped scope and [the repository README](../README.md) for the v1/v2 product split.
