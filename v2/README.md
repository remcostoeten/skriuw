# Skriuw

Skriuw (Frisian: "to write") is a local-first note-taking application for
macOS, Windows, and Linux, built with Rust, React, ProseMirror, SQLite, and
Tauri. The workspace lives on your machine as a SQLite database; cloud sync
exists, is off by default, and is never required. The same Rust core,
compiled to WebAssembly, runs in the browser at <https://skriuw.com/app>.

The editor accepts Markdown input rules and paste, and provides tables,
checklists, toggles, code blocks, slash commands, find and replace, typed
note properties, images, and flowcharts that round-trip through Mermaid.
References — `#` tags, `$` people, and `[[` wiki-links — are stored by ID, so
renames propagate, and every note, tag, and person lists its backlinks. Notes
form a nested tree that stays fast past 5,000 nodes, with tabs, split view,
pinned notes, drag and drop, and a trash bin with subtree restore. A daily
journal records moods and streaks. Note history is materialized into a hidden
Git repository in the background with in-app restore, verified backups rotate
every six hours, and the workspace exports as a JSON archive. Importers exist
for Markdown, Obsidian, Notion, Bear, Simplenote, and Apple Notes. Every
operation is reachable from the keyboard.

[FEATURES.md](FEATURES.md) is the complete feature reference.

## Installation

The [latest GitHub release](https://github.com/remcostoeten/skriuw/releases/latest)
has installers for macOS, Windows, and Linux (`.dmg`, `.exe`/`.msi`, `.deb`,
`.rpm`, AppImage).

### Debian / Ubuntu (APT)

```bash
curl -fsSL https://remcostoeten.github.io/skriuw/apt/key.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/skriuw.gpg
echo "deb [signed-by=/usr/share/keyrings/skriuw.gpg] https://remcostoeten.github.io/skriuw/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/skriuw.list
sudo apt update && sudo apt install skriuw
```

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

AUR publication is currently paused upstream, so the AUR package can lag
behind the latest release. Winget and Snap are wired into release automation
but have no current publication; use a release asset or one of the channels
above.

## Privacy

A fresh install performs no network requests. Notes, images, search indexes,
Git history, and backups are local files. The only network calls in the
codebase are the opt-in sync Worker and the desktop auto-updater's version
check. There is no analytics, crash reporting, or telemetry. Remote images
referenced in Markdown are kept as source text and never fetched.

With sync enabled, operations and content chunks for your private workspace
are stored in Cloudflare D1/Durable Object SQLite and R2, encrypted in
transit. End-to-end encryption is an open decision tracked in
[docs/specs/cloud-sync-master.md](docs/specs/cloud-sync-master.md); if that
boundary matters to you, stay local-only.

## Architecture

One Rust domain core sits behind narrow ports, with swappable adapters for
desktop (native SQLite), browser (SQLite-WASM in OPFS), and tests. Every user
action updates renderer state synchronously and paints in the same frame,
then submits a versioned `WorkspaceOperation` to a serialized backend queue.
Expensive work — Git history, backups, sync — consumes durable outboxes on
background threads and never blocks typing or navigation.

- [ARCHITECTURE.md](ARCHITECTURE.md) — system shape, runtime contract, recovery
- [docs/adr](docs/adr) — architecture decision records
- [docs/specs](docs/specs) — implementation contracts (sync, auth, editor, imports)
- [docs/performance-contract.md](docs/performance-contract.md) — performance
  budgets, with evidence in [docs/benchmarks](docs/benchmarks)

### Cloud sync

Sync replicates versioned domain operations, never SQLite files, through an
ordered per-workspace log in a Cloudflare Durable Object, with
content-addressed chunks in R2 for large content and images. Concurrent edits
to the same document become explicit both-version conflicts, never silent
merges. Rejected or blocked operations are visible and retryable from Account
settings. Auth is Better Auth (email/password) in the same Worker;
authorization is server-owned and workspaces are derived from the
authenticated subject, never from request bodies. Details:
[docs/specs/cloud-sync-master.md](docs/specs/cloud-sync-master.md),
[cloud-sync-authentication.md](docs/specs/cloud-sync-authentication.md),
[ADR-0026](docs/adr/0026-optional-cloud-operation-replication.md).

### Layout

```text
crates/skriuw-domain       Data and operation protocol; no I/O
crates/skriuw-storage      Storage port
crates/skriuw-sqlite       Native SQLite adapter and ordered SQL migrations
crates/skriuw-sqlite-wasm  Browser SQLite-WASM/OPFS adapter and worker
crates/skriuw-runtime      Serialized backend worker and request queue
crates/skriuw-sync         Optional background cloud sync coordinator
crates/skriuw-history      Portable leased history worker
crates/skriuw-history-git  Native Git history adapter
crates/skriuw-images       Note image decoding and storage
crates/skriuw-lifecycle    Startup, shutdown, and backup rotation
crates/skriuw-fixtures     Deterministic scale fixtures
crates/skriuw-cli          Database development utility
cloud                      Cloudflare Worker sync service
app                        React renderer and Tauri desktop shell
spikes                     Retained measurement harnesses run by the build
xtask                      Repository automation and contract generation
contracts/generated        Generated JSON Schema
docs                       ADRs, specs, and benchmarks
scripts                    Contributor/CI entrypoints
```

Inside `app/src`, product features live under `features/` (editor, journal,
references, settings, transfer, and so on); `bridge/`, `store/`, `shell/`,
`commands/`, `shared/`, and `contracts/` are the platform layers beside them.
The desktop shell in `app/src-tauri` keeps `lib.rs` as command registration,
with shared state in `state.rs` and one command module per capability under
`commands/`.

## Development

Requirements: Rust 1.95.0 (`rust-toolchain.toml` installs components via
rustup), Bun 1.3, Node.js 24, Bash, and the platform dependencies required by
Tauri.

```bash
./scripts/bootstrap.sh   # one-time setup
./scripts/check.sh       # full check gate: contracts, lint, all tests
./scripts/build.sh       # build (also: web | desktop | ci)
./scripts/generate.sh    # regenerate Rust→TypeScript JSON Schema contracts
./scripts/check-wasm.sh  # browser portability + OPFS durability gate
./scripts/dev-db.sh      # local dev database
```

Generated contracts in `contracts/generated` are committed and drift-checked
in CI. `skriuw-cli` (`cargo run -p skriuw-cli -- <snapshot|integrity|export|backup|restore>`)
provides database utilities.

### Web deployment

The repository-root Vercel project serves the browser build at
`https://skriuw.com/app/` and redirects the bare domain there. Its build runs
`scripts/vercel-build.sh`, which compiles the pinned Rust core to WASM,
builds the renderer with the `/app/` asset base, and stages one static
deployment artifact. The Cloudflare Worker remains the separate
authentication and sync data plane. After deployment, run
`node scripts/verify-web-deployment.mjs` to check the static assets, WASM
MIME type, browser bootstrap, OPFS initialization, and browser console.

### Cloud development

The sync service is a Cloudflare Worker in `cloud/`; see
[cloud/README.md](cloud/README.md) for deployment. Apply its D1 migrations
and create `.dev.vars` from `.dev.vars.example`, then start it locally —
debug desktop builds use `http://localhost:8787`, release builds use the
production Worker. Set `VITE_SKRIUW_CLOUD_URL` to override at build time.

The Worker only answers origins in `AUTH_TRUSTED_ORIGINS` (403 otherwise).
Production trusts `https://skriuw.com` and the Tauri origins — never widen
that list to make a test pass. For end-to-end runs against real
infrastructure use the `preview` environment, which has its own D1/R2/Durable
Object storage and is the only deployment trusting the `http://localhost:5183`
dev origin:

```bash
bun --cwd cloud run check
bunx wrangler deploy --env preview   # in cloud/
```

## Legacy (v1)

The previous generation of Skriuw — web, mobile, collaboration, and
self-hosting — lives in [`apps/`](../apps) and [`packages/`](../packages) and
is frozen. It is no longer the hosted application; its self-hosted source
remains available. See the [repository README](../README.md).

## Contributing

Start with [CONTRIBUTING.md](../CONTRIBUTING.md), follow the
[Code of Conduct](../CODE_OF_CONDUCT.md), and open a focused pull request
with relevant tests. Found a security issue? Follow
[SECURITY.md](../SECURITY.md) instead of opening a public issue.

## License

Skriuw is released under the [MIT License](../LICENSE).
