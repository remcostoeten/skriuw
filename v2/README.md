# Skriuw Standalone

Local-first notes application with a Rust backend, React renderer, and Tauri desktop shell.

## Current decisions

- SQLite is canonical storage.
- UI navigation will read a fully hydrated in-memory workspace.
- UI actions become versioned `WorkspaceOperation` messages.
- Persistence adapters stay behind one small contract.
- Native desktop ships first. Browser-local storage remains possible later.
- Git history runs asynchronously and never blocks editing or navigation.

See [FEATURES.md](FEATURES.md) for what the app does, [ARCHITECTURE.md](ARCHITECTURE.md) for how it is built, and [docs/adr](docs/adr) for why.

## Installation

### Debian / Ubuntu (APT)

Direct package installation:
```bash
curl -sL https://github.com/remcostoeten/skriuw-standalone/releases/latest/download/skriuw-app_amd64.deb -o skriuw.deb
sudo apt install ./skriuw.deb
```

APT Repository (automatic updates):
```bash
curl -fsSL https://remcostoeten.github.io/skriuw-standalone/KEY.gpg | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/skriuw.gpg
echo "deb [signed-by=/etc/apt/trusted.gpg.d/skriuw.gpg] https://remcostoeten.github.io/skriuw-standalone stable main" | sudo tee /etc/apt/sources.list.d/skriuw.list
sudo apt update && sudo apt install skriuw
```

### macOS (Homebrew)
```bash
brew install remcostoeten/tap/skriuw
```

### Windows (Winget & Scoop)
```cmd
winget install remcostoeten.skriuw
```
```cmd
scoop bucket add skriuw https://github.com/remcostoeten/scoop-bucket
scoop install skriuw
```

### Arch Linux (AUR)
```bash
yay -S skriuw-bin
```

## Requirements

- Rust 1.95.0. `rust-toolchain.toml` installs required components through rustup.
- Node.js 24 and pnpm 11.
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
./scripts/generate.sh
./scripts/dev-db.sh
cargo run -p skriuw-cli -- snapshot .data/skriuw.db
cargo run -p skriuw-cli -- integrity .data/skriuw.db
cargo run -p skriuw-cli -- export .data/skriuw.db workspace.json
cargo run -p skriuw-cli -- backup .data/skriuw.db workspace.backup.db
cargo run -p skriuw-cli -- restore workspace.backup.db restored.db
```

Every build entry point runs generated-contract checks, Rust formatting and linting, all default backend, desktop, renderer, renderer-store, and UI-architecture tests, executed-source renderer coverage, and TypeScript validation before producing artifacts. `pnpm build`, `pnpm tauri build`, and `pnpm tauri:build` route through the same orchestrator. Successful local builds print terminal links to their artifacts; CI uploads the release binaries, renderer bundle, and complete logs.

`import <database> <archive.json>` validates the portable archive and creates a timestamped safety backup before transactional replacement. Backup, restore, and export refuse to overwrite existing targets.

`generate.sh` creates JSON Schema contracts from Rust domain types. Generated files are committed and checked for drift.

## Layout

```text
crates/skriuw-domain   Data and operation protocol; no I/O
crates/skriuw-storage  Storage port
crates/skriuw-sqlite   Native SQLite adapter
crates/skriuw-runtime  Serialized backend worker and request queue
crates/skriuw-history  Portable leased history worker
crates/skriuw-history-git  Native Git history adapter
crates/skriuw-cli      Database development utility
xtask                   Repository automation and contract generation
migrations              Ordered SQL migrations
generated/contracts     Generated JSON Schema
docs/adr                Architecture decision records
scripts                 Stable contributor/CI entrypoints
```

## Status

v1 complete: the full desktop application — editor, workspace tree, search, tags/people/mentions, Git history, backups, recovery, and the release pipeline — has shipped and passes its end-to-end and performance gates. See [FEATURES.md](FEATURES.md).
