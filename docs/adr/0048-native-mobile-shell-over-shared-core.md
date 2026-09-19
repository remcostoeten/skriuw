# ADR-0048: A native mobile shell over the shared Rust core

- Status: proposed
- Date: 2026-09-19

## Context

Skriuw reaches phones today as the installed browser build: the compact shell
(ADR-0041, ADR-0047) over worker-owned SQLite WASM and OPFS (ADR-0027). That
path cannot reach the share sheet on iOS, widgets, biometric unlock, background
sync, or durable storage that the platform will not evict, and it inherits
every WebKit quirk of a page rather than an app.

Three properties of the current architecture make a native client cheap where
it matters:

- The Rust core is framework-free. `skriuw-domain`, `skriuw-runtime`,
  `skriuw-storage`, `skriuw-sqlite`, `skriuw-sync` and `skriuw-crypto` carry no
  Tauri, filesystem-layout, or operating-system dependency, and no crate
  manifest names Tauri.
- The renderer already talks to storage through one seam,
  `app/src/bridge/commands.ts`, with two implementations: Tauri `invoke` and
  the browser storage worker.
- Rust/TypeScript contracts are generated, committed and drift-checked.

The editor is the opposite: raw ProseMirror with roughly 2,500 lines of editor
CSS, node views, and a decoration-based AI review surface. It cannot run in
React Native and must not be rewritten.

## Decision

Build the mobile client as an Expo (React Native) application with three
layers:

1. **Shared core, native.** A new `crates/skriuw-mobile` facade exposes the
   use cases the mobile client needs over UniFFI. An Expo native module
   (`mobile/modules/skriuw-core`) wraps the generated bindings. SQLite stays
   canonical and native (`rusqlite`, bundled); durable writes stay serialized
   and transactional inside Rust. The mobile client is the third implementation
   of the bridge seam, not a new protocol.
2. **Shared renderer logic, extracted.** The dependency-free store, operation
   queue, tree model and route model move from `app/src` into
   `shared/renderer-core`, consumed by both `app/` and `mobile/`. Theme tokens
   stay authored in `themes.css`; a generator emits a committed, drift-checked
   TypeScript token map for React Native.
3. **Native chrome, web editor.** Navigation, toolbar, tab bar, sheets, lists,
   search and settings are React Native views. The editor is the existing
   ProseMirror surface mounted once in a persistent Expo DOM component
   (webview) that swaps documents by message. It is never remounted on
   navigation.

Excluded from the mobile build: `skriuw-history-git` (libgit2),
`skriuw-ai-ollama`, import adapters, scheduled backups, tabs and split view.

## Alternatives considered

- **Tauri 2 mobile.** Reuses the compact shell and all Rust unchanged and is
  the cheapest route to an identical interface. Rejected as the primary path
  because it keeps the whole interface in a webview: no native navigation,
  lists, keyboard handling or share extension without per-platform plugins,
  which is the gap that motivates a native client at all. It remains the
  fallback if the UniFFI spike (Mobile 02) fails.
- **Installed browser build only.** No new code, and it stays supported.
  Rejected as sufficient because of the platform gaps in Context.
- **Whole renderer in one webview inside Expo.** A worse Tauri: the costs of
  both stacks and the benefits of neither.
- **Rewriting the editor natively.** Rejected outright; two editors cannot
  hold document-format parity.

## Consequences

- Two interfaces must hold parity. Shared core, shared store and generated
  tokens bound the drift; chrome is duplicated on purpose.
- The repository root gains JavaScript workspaces so `app/`, `mobile/` and
  `shared/*` resolve one another.
- iOS artifacts need macOS: the xcframework is produced by a macOS CI runner
  and the application by EAS Build. Android builds and emulator end-to-end
  tests run on Linux and are the local development target.
- Expo Go is not usable once the native module exists; development builds are
  required.
- The performance contract applies unchanged: navigation must not wait on the
  native module or the webview. The snapshot is hydrated into the store at
  startup and the editor webview is kept warm.
- Background sync on iOS cannot rely on the WebSocket wake channel and needs
  silent push plus background tasks.

Implementation contract: `docs/specs/mobile-app.md`.
