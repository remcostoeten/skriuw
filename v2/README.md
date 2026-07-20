# Skriuw Standalone

Backend-first foundation for a local, standalone notes application. No frontend or desktop shell is selected yet.

## Current decisions

- SQLite is canonical storage.
- UI navigation will read a fully hydrated in-memory workspace.
- UI actions become versioned `WorkspaceOperation` messages.
- Persistence adapters stay behind one small contract.
- Native desktop ships first. Browser-local storage remains possible later.
- Git history runs asynchronously and never blocks editing or navigation.

See [ARCHITECTURE.md](ARCHITECTURE.md), [TODO.md](TODO.md), [docs/handoff.md](docs/handoff.md), [docs/roadmap.md](docs/roadmap.md), and [docs/adr](docs/adr).

## Requirements

- Rust 1.95.0. `rust-toolchain.toml` installs required components through rustup.
- Bash.

## Bootstrap

```bash
./scripts/bootstrap.sh
```

## Common commands

```bash
./scripts/build.sh
./scripts/check.sh
./scripts/generate.sh
./scripts/dev-db.sh
cargo run -p skriuw-cli -- snapshot .data/skriuw.db
cargo run -p skriuw-cli -- integrity .data/skriuw.db
cargo run -p skriuw-cli -- export .data/skriuw.db workspace.json
cargo run -p skriuw-cli -- backup .data/skriuw.db workspace.backup.db
cargo run -p skriuw-cli -- restore workspace.backup.db restored.db
```

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

Foundation only. UI framework, desktop shell integration, editor engine, synchronization service, and delivery plan remain intentionally uncommitted.
