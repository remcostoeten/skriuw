# Skriuw v2

Skriuw v2 is the current, fully released Skriuw desktop application: a local-first knowledge base built around one promise — every interaction gives same-frame feedback. No spinners, no sync dialogs, no "loading your notes". The whole workspace lives on your machine as plain SQLite, opens instantly, and stays yours. It is distinct from [v1](../README.md#v1-legacy-web-mobile-and-self-hosted), which provides the legacy web, mobile, cloud, and self-hosted product.

- **What it does** → summarized below, in full in [FEATURES.md](FEATURES.md)
- **How it is built** → summarized below, in full in [ARCHITECTURE.md](ARCHITECTURE.md)
- **Why it is built that way** → [docs/adr](docs/adr) (28 architecture decision records)
- **Performance promises** → [docs/performance-contract.md](docs/performance-contract.md), evidence in [docs/benchmarks](docs/benchmarks)

## What the app can do

- **Writing** — a ProseMirror rich-text editor with Markdown input rules and Markdown paste, six heading levels, checklists, toggles, tables, code blocks, find and replace, slash commands, an emoji picker, typed note properties, inline images, cover images, video/audio/file embeds, and keyboard-editable embedded flowcharts that round-trip as Mermaid. Notes with thousands of blocks stay fast behind a bounded 192-block editor window.
- **Connecting** — `#` tags, `$` people, and `@`/`[[` wiki-links are stored by ID, so renames propagate everywhere; every note, tag, and person shows precomputed backlinks.
- **Organizing** — a virtualized nested tree smooth at 5,000+ nodes, pinned notes, tabs and split view, full keyboard control, drag and drop, and a trash with whole-subtree restore and purge.
- **Journaling** — one entry per day in the same editor, mood tracking, a keyboard-first month calendar, streaks and stats; entries are ordinary workspace notes hidden from the tree.
- **History and safety** — automatic background Git history with in-app restore, verified backups every six hours, portable JSON workspace archives, verified live database restore, and previewed atomic imports from Markdown, Obsidian, Notion, Bear, Simplenote, and Apple Notes.
- **Optional cloud sync** — off by default; opt in per device to replicate your workspace through a private cloud log. Detailed below.

See [FEATURES.md](FEATURES.md) for the complete feature reference.

## How it works

SQLite is canonical storage. Startup hydrates the entire workspace into memory once; after that, navigation touches no disk, IPC, network, parsing, or Git. Every user action updates renderer state synchronously and paints in the same frame, then submits a versioned `WorkspaceOperation` to a serialized backend queue for durability:

```text
User action
├── synchronous local state update
├── same-frame paint
└── queued WorkspaceOperation
    ├── one bounded SQLite transaction
    ├── search projection update (FTS)
    ├── durable history outbox append   → background Git materialization
    ├── durable sync outbox append      → background cloud replication (opt-in)
    └── revision acknowledgment
```

Anything expensive — Git history, backups, cloud sync, cache rebuilds — consumes durable outboxes on background threads and can fail, retry, or lag without ever blocking typing or navigation. The performance contract (cached note swap and keystroke-to-paint under 8 ms at P95, zero dropped frames across hundreds of rapid switches) is enforced by a production benchmark gate, not aspiration.

## Architecture

One Rust domain core, narrow ports, and swappable adapters. The domain layer performs no database, filesystem, framework, or operating-system work; backend capabilities are use-case traits, not table-shaped CRUD.

```text
React renderer (normalized store, persistent ProseMirror host, command registry)
└── WorkspacePort
    ├── desktop adapter (Tauri 2)
    │   ├── skriuw-runtime    serialized FIFO backend worker
    │   ├── skriuw-sqlite     native SQLite: migrations, FTS, outboxes
    │   ├── skriuw-history*   background Git materialization
    │   ├── skriuw-lifecycle  startup, verified restore, backup rotation
    │   └── skriuw-sync       optional background cloud coordinator
    ├── browser adapter
    │   └── worker-owned SQLite-WASM persisted in OPFS
    └── memory adapter (tests and fixtures)

skriuw-domain: records + versioned operations, no I/O — everything depends inward on it
```

Contracts between Rust and TypeScript are generated JSON Schema (`contracts/generated`), committed and drift-checked in CI. Failures project to bounded, redacted diagnostics at the boundaries; recovery-relevant failures stay visible and testable. [ARCHITECTURE.md](ARCHITECTURE.md) covers the runtime contract, save batching, the history pipeline, and recovery in depth.

## Privacy

Skriuw is private by default, by architecture rather than by policy toggle:

- **Local-only is the default state.** A fresh install performs no network requests: notes, images, search indexes, Git history, and backups are all local files. Cloud sync exists only after you sign in and explicitly choose **Enable sync**, and stops the moment you choose **Pause sync** or sign out.
- **No telemetry.** The app contains no analytics, crash reporting, or tracking of any kind — the only network endpoint in the codebase is the opt-in sync Worker (plus the update check performed by the desktop auto-updater).
- **Remote content is blocked.** Markdown notes that reference remote images keep the reference as portable source, but the app never fetches it, so reading a note can't ping an external server.
- **Diagnostics are bounded and redacted.** Error diagnostics carry stable categories with a normalized message ceiling; public projections redact adapter detail, and bootstrap data and portable archives never include internal retry queues.
- **When sync is enabled**, the server stores your replicated operations and content chunks for your private workspace (see [Cloud sync](#how-cloud-sync-works)). Content is encrypted in transit (TLS) and stored in Cloudflare D1/Durable Object SQLite and R2; end-to-end encryption is an explicitly open product decision tracked for before public beta in [the cloud sync master tracker](docs/specs/cloud-sync-master.md). If that boundary matters to you today, stay in local-only mode — it is a first-class, permanent mode, not a degraded one.

## How auth works

Identity is Better Auth (email/password) running inside the v2 Cloudflare Worker, with accounts, credential hashes, and sessions in a dedicated D1 database. Nothing about auth touches local workspace startup: the Account settings section lazy-loads the auth UI on demand.

- **Desktop** stores the bearer session in the operating-system credential vault and resumes sync on a background thread at launch.
- **Browser** persists the session token in `localStorage` under a versioned key, so a reload resumes sync without signing in again. The value is validated on load and cleared when malformed; explicit sign-out and any server rejection clear it, and the server stays the sole authority on expiry. The accepted tradeoff — an XSS compromise of the app origin could read the token, mitigated by the strict CSP and the absence of third-party scripts — is recorded in [ADR-0028](docs/adr/0028-browser-worker-owned-sync.md).
- **Authorization is server-owned.** `POST /v1/sync/provision` derives an opaque private workspace from the trusted Better Auth subject and registers the device; request bodies cannot choose a workspace, user, or role. Every sync route validates the bearer, checks server-side workspace membership and the device registry, and only then resolves the workspace's Durable Object — caller-supplied identifiers never substitute for authorization. The current release provisions one owner-only workspace per account; sharing is later work.

Full boundary specification: [docs/specs/cloud-sync-authentication.md](docs/specs/cloud-sync-authentication.md).

## How cloud sync works

Sync replicates versioned domain operations — never SQLite files or pages. Each workspace has one ordered, append-only log inside a SQLite-backed Cloudflare Durable Object, which is the single ordering authority; SQLite on each device remains the interaction store.

```text
Device A                        Cloud (Worker)                    Device B
────────                        ──────────────                    ────────
edit → sync_outbox ──push──▶ auth + membership check
                             Durable Object appends to
                             the ordered workspace log ──pull──▶ apply in order
                                        │                        (idempotent,
large content / images ──▶ R2 content-  │                         local echoes
   (content-addressed      addressed    │                         skipped)
    SHA-256 chunks)        chunk store  │
                                        ▼
                             versioned checkpoints
                             (bounded fresh-device hydration)
```

- **Durable outbox, background coordinator.** Local edits enter a transactional `sync_outbox` in the same commit as the edit itself. One coalesced coordinator loop per workspace pushes, acknowledges, pulls, and applies in the background with classified failures and bounded jittered backoff — never on typing, navigation, or recovery paths. ([docs/specs/desktop-sync-coordinator.md](docs/specs/desktop-sync-coordinator.md))
- **Exactly-once effect.** Operations carry stable identities; the server log is gap-free per client, pulls are cursor-based, and duplicates and local echoes never reapply. ([docs/specs/cloud-sync-delivery.md](docs/specs/cloud-sync-delivery.md))
- **Deterministic convergence.** A per-operation policy defines what applies directly, what transforms against concurrent work, and what becomes a durable both-versions conflict for explicit user resolution — concurrent edits to the same document are preserved, never silently merged away. ([docs/specs/sync-convergence-v1.md](docs/specs/sync-convergence-v1.md), [workspace-operation-sync-policy-v1.md](docs/specs/workspace-operation-sync-policy-v1.md))
- **Large content and images.** Operations above the inline ceiling and image blobs travel as content-addressed SHA-256 chunks through R2, verified by re-hashing on both ends; chunk storage is workspace-scoped, so digests can't be probed across tenants. ([docs/specs/sync-content-chunks-v1.md](docs/specs/sync-content-chunks-v1.md))
- **Checkpoints.** The coordinator periodically publishes verified workspace checkpoints so a fresh device hydrates with bounded work instead of replaying the entire log, then catches up from its cursor. Retention never deletes log entries a device or checkpoint still needs.
- **Visible failure and recovery.** An operation the server rejects, or one waiting on a missing image blob, becomes a durable blocked record you can inspect, retry, or discard from Account settings (discards leave an audit trail). Missing-blob blocks clear automatically once the image bytes arrive.
- **First connect** transactionally queues your existing notes, folders, tags, people, properties, templates, pins, trash state, and images before streaming later edits. Sharing and account deletion remain pre-beta work.

The end-to-end tracker is [docs/specs/cloud-sync-master.md](docs/specs/cloud-sync-master.md); the protocol decision is [ADR-0026](docs/adr/0026-optional-cloud-operation-replication.md).

## Browser runtime

The hosted browser build (`https://skriuw.com/app`) runs the same Rust storage logic compiled to WASM: a dedicated worker owns SQLite-WASM persisted through OPFS, so the renderer never blocks on persistence ([ADR-0027](docs/adr/0027-browser-sqlite-opfs-sah-pool.md)). Workspace archives cover export, import, and recovery in the browser. The worker-owned cloud sync runtime — shared protocol logic with desktop, checkpoint hydration, an OPFS asset store — has landed ([ADR-0028](docs/adr/0028-browser-worker-owned-sync.md)), and browser sync is now enabled in the product UI: sign in from Account settings and choose **Enable sync**, exactly as on desktop, with checkpoint hydration reported as live progress while a fresh browser workspace catches up. Sync stays off until you enable it. One capability gap remains — reviewing and recovering individual blocked operations is desktop-only for now, so the browser surfaces a blocked workspace and offers retry rather than a per-operation list.

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

## Development

### Requirements

- Rust 1.95.0. `rust-toolchain.toml` installs required components through rustup.
- Bun 1.3 and Node.js 24. Bun installs dependencies and runs package scripts; Node runs the renderer test suite.
- Bash.

### Bootstrap

```bash
./scripts/bootstrap.sh
```

### Common commands

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

`check-wasm.sh` is the portability and browser-durability gate. It compiles the backend-neutral domain/storage crates and the browser adapter, generates the version-matched WASM module, then proves in headless Chromium that a write made through the application bridge survives worker close and page reload in OPFS. Native Git, lifecycle, CLI, and Tauri crates remain outside the browser runtime.

Every build entry point runs generated-contract checks, Rust formatting and linting, all default backend, desktop, renderer, renderer-store, and UI-architecture tests, executed-source renderer coverage, and TypeScript validation before producing artifacts. `bun run build`, `bun run tauri:build`, and `bun run check` route through the same orchestrator.

`generate.sh` creates JSON Schema contracts from Rust domain types. Generated files are committed and checked for drift.

### Cloud development

Start the Worker in `cloud/` after applying its D1 migrations and creating `.dev.vars` from `.dev.vars.example`. Debug desktop builds use `http://localhost:8787`; release desktop builds use the production Worker at `https://skriuw-v2-cloud.remcostoeten.workers.dev`. Set `VITE_SKRIUW_CLOUD_URL` only to override the default Worker at build time.

Deployment lives in [cloud/README.md](cloud/README.md). One constraint matters when testing a browser client: the Worker answers only the origins in `AUTH_TRUSTED_ORIGINS` and replies `403 origin_not_allowed` to anything else, so a browser build served from an unlisted origin cannot reach cloud sync. Production trusts `https://skriuw.com` and the two Tauri origins, and nothing else — never widen that list to make a test pass. End-to-end runs against real infrastructure use the `preview` environment instead, which owns separate D1, R2, and Durable Object storage and is the only deployment that trusts the `http://localhost:5183` dev origin:

```bash
bun --cwd cloud run check
bunx wrangler deploy --env preview   # in cloud/
```

The Vite web build uses relative asset paths, so the output can be mounted below `/app`:

```bash
./scripts/build.sh web
```

## Layout

```text
crates/skriuw-domain       Data and operation protocol; no I/O
crates/skriuw-storage      Storage port
crates/skriuw-sqlite       Native SQLite adapter
crates/skriuw-sqlite-wasm  Browser SQLite-WASM/OPFS adapter and worker
crates/skriuw-runtime      Serialized backend worker and request queue
crates/skriuw-sync         Optional background cloud sync coordinator
crates/skriuw-history      Portable leased history worker
crates/skriuw-history-git  Native Git history adapter
crates/skriuw-images       Note image decoding and storage
crates/skriuw-lifecycle    Startup, shutdown, and backup rotation
crates/skriuw-fixtures     Deterministic scale fixtures
crates/skriuw-cli          Database development utility
cloud                      v2-only Cloudflare Worker sync service
app                        React renderer and Tauri desktop shell
spikes                     Retained measurement harnesses run by the build
xtask                      Repository automation and contract generation
migrations                 Ordered SQL migrations
contracts/generated        Generated JSON Schema
docs/adr                   Architecture decision records
docs/specs                 Implementation contracts
docs/benchmarks            Performance evidence
scripts                    Stable contributor/CI entrypoints
```

## Status

v2 is the current desktop release. See [FEATURES.md](FEATURES.md) for its shipped scope and [the repository README](../README.md) for the v1/v2 product split.
