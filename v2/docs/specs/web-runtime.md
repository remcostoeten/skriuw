# Web runtime

Status: browser runtime foundation in progress. The portable domain/storage
compile boundary, browser worker protocol, and renderer runtime seam are now
gated; OPFS-backed SQLite execution, browser history, and recovery semantics
remain deferred.

Scope note: this spec covers the browser runtime only (wasm crates, SQLite-WASM adapter, fixture parity). Mobile and a browser extension are explicitly out of scope for this spec and remain unscheduled separate efforts.

## Why this isn't speculative

The system shape in `ARCHITECTURE.md` already names the target:

```text
WorkspacePort
├── desktop adapter — native SQLite and background Git
├── browser adapter — worker-owned SQLite WASM and OPFS
└── memory adapter — tests and fixtures
```

`skriuw-domain` has no database, filesystem, framework, or OS dependency by construction (ADR-0001, `AGENTS.md`'s Rust/storage rules). `skriuw-storage` defines the port as use-case traits, not table CRUD, specifically so a second adapter can implement the same contract. This work is "write the second adapter the architecture was already designed for," not "redesign for portability."

## Goal

A browser-based build of the same renderer, backed by the same domain/operation contracts, storing data durably in the browser (OPFS-backed SQLite via wasm) instead of native SQLite + Tauri IPC — with the same interaction-latency guarantees as desktop: no navigation-path network, disk (beyond OPFS), or parsing dependency.

## Work items

### 1. Compile portable crates for `wasm32-unknown-unknown`

Target: `skriuw-domain`, `skriuw-storage` (the port/trait definitions), and any pure-logic crate that doesn't already assume native OS access. `skriuw-sqlite`, `skriuw-history-git`, `skriuw-lifecycle`, and `skriuw-cli` are native-only by design and are not part of this target — the browser adapter gets its own crate (`skriuw-sqlite-wasm` or similar), implementing the same `skriuw-storage` port, not a recompiled `skriuw-sqlite`.

Concretely:
- `wasm32-unknown-unknown` is installed by `rust-toolchain.toml`.
- `./scripts/check-wasm.sh` builds `skriuw-domain` and `skriuw-storage` for that
  target with the locked dependency graph.
- CI runs the script in a dedicated job. The ordinary local product gate stays
  native-focused, while portability drift still blocks integration.

### 2. Worker-owned SQLite-WASM adapter over durable browser storage

The initial `skriuw-sqlite-wasm` crate now defines the typed worker request and
response boundary and can dispatch against any `WorkspaceStorage` implementation
for parity tests. The TypeScript bridge also routes browser calls through a
dedicated module worker. The next implementation step is connecting that
boundary to a real SQLite-WASM connection and OPFS VFS; the current browser
worker intentionally returns an explicit unavailable error until then.

New crate, e.g. `skriuw-sqlite-wasm`, implementing the `skriuw-storage` port using `sqlite-wasm-rs` (or the equivalent official SQLite WASM build) against OPFS (Origin Private File System) — OPFS is the only browser storage with the durability and random-access-write characteristics SQLite needs; IndexedDB-backed SQLite shims exist but are slower and less transactionally sound, and should not be the default choice without a specific measured reason.

- SQLite WASM must run inside a Web Worker, not the main thread — the same "off the renderer/UI thread" rule that governs the native runtime worker (`skriuw-runtime`) applies identically here, and is more urgent in the browser since the main thread also owns rendering.
- The worker communicates with the renderer via `postMessage`, mirroring the shape of `skriuw-runtime`'s FIFO request queue and waitable completion handles — the goal is that `app/src/bridge/**`'s Tauri-specific implementation and a new browser-worker-specific implementation both satisfy the same renderer-facing bridge contract, so `app/src/store/**` and everything above it does not know which adapter is active.
- Migrations: the same SQL files under `migrations/` must apply unmodified inside the worker (`docs/data-model.md`'s "migration execution remains adapter-owned so a future SQLite-WASM implementation can apply the same SQL files inside its worker" is an explicit design commitment already made — honor it; do not fork the migration files).
- Git history: native builds materialize history via `skriuw-history-git`. The browser adapter has no filesystem Git available. Per the existing TODO item this spec absorbs ("select local revision or remote history materializer"), the browser adapter needs its own `skriuw-history` implementation — likely a local revision-cache-only mode (no external Git materialization) as the default, with a remote materializer as a later, separate decision requiring its own ADR (it implies a server, which ADR-0001 explicitly scopes as "optional replication, never primary reads").

### 3. Fixture parity: prove native and web adapters behave identically

`skriuw-fixtures` already generates deterministic operation-sequence workspaces "for scale and adapter testing" per `ARCHITECTURE.md`, depending only on domain contracts — this is already adapter-agnostic by design.

- Run the existing shared operation fixtures (the same sequences that exercise `skriuw-sqlite`) against the new wasm adapter and assert identical resulting `WorkspaceSnapshot`s.
- Run the existing archive fixtures (`docs/archive-fixtures.md`, ADR-0019) through the wasm adapter's import/export path and assert byte-identical or semantically-identical round trips to the native path.
- Run the existing tree fixtures (1,000- and 5,000-node scale fixtures per `docs/fixtures.md`) through the wasm adapter and confirm the renderer-side tree/virtualization code (which is adapter-agnostic already, per the system shape diagram) performs correctly against it — this is mostly a proof that nothing renderer-side accidentally assumed a desktop-only data shape.
- Recovery fixtures: native backup/restore/verified-swap (N1/N2) has no direct browser equivalent (there's no separate "file" to swap in OPFS the same way) — this item likely needs its own smaller design note once reached, covering what "backup" and "restore" mean for an OPFS-backed database (e.g. exporting the portable archive is the browser's backup story, not a binary SQLite file copy). Flag this rather than silently skip it.

## Explicitly out of scope for this spec

- Mobile.
- Browser extension.
- Multi-device sync (a browser adapter is a second local storage location, not sync — ADR-0001's "future sync requires durable operations, revisions, tombstones, and conflict handling" is unstarted and separate).
- Any UI/UX difference between desktop and web beyond what's forced by the adapter boundary (window chrome, install prompts, etc.) — the renderer and its performance contract are meant to be shared, not forked.

## Acceptance criteria

- `skriuw-domain` and `skriuw-storage` build for `wasm32-unknown-unknown` in CI, gated so future native-only code additions to those crates fail fast.
- A browser build boots, bootstraps a workspace from OPFS-backed SQLite inside a worker, and reaches the same "fully hydrated in-memory workspace, zero-IPC navigation" state the desktop build reaches, per `ARCHITECTURE.md`'s runtime contract.
- Shared operation, archive, and tree fixtures produce equivalent results run against both the native and wasm adapters — committed as a comparison test, not a one-off manual check.
- The renderer, sidebar, and editor code require zero adapter-specific branching (verified by the fact that `app/src/store/**` and above don't import anything from `skriuw-sqlite-wasm` or Tauri-specific bridge code directly).
- A written decision (ADR) exists for the browser history-materialization strategy before that piece is implemented, since it's a real architectural choice, not a mechanical port.
- Recovery/backup semantics for the browser adapter are explicitly documented (even if "portable archive export is the only backup mechanism for v1 of the web runtime") rather than left implicit.
