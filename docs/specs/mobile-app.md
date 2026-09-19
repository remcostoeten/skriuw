# Mobile app

Status: proposed. Nothing in this spec is implemented. Architecture decision:
[ADR-0048](../adr/0048-native-mobile-shell-over-shared-core.md). Work is tracked
in the **Mobile app** GitHub milestone as issues `Mobile 01` to `Mobile 16`;
each issue carries its own outcome, contract and acceptance and refers back to
the requirement ids below.

## Scope

An iOS and Android client for the v2 workspace: native chrome, the existing
ProseMirror editor in a persistent webview, and the shared Rust core over
native SQLite. The installed browser build (`web-runtime.md`) stays supported
and is not replaced.

Out of scope for 1.0: Git history, local (Ollama) AI, import adapters,
scheduled backups and archive swap, tabs and split view, vim mode, the diagram
builder, drawing, tablet layouts.

## Requirements

### Architecture

- **R-A1** SQLite is canonical and native. All durable writes go through the
  Rust core, serialized and transactional. No second persistence path in
  TypeScript.
- **R-A2** The mobile client implements the existing bridge seam
  (`app/src/bridge/commands.ts`) for the subset in *Command surface*. It
  submits the same versioned `WorkspaceOperation` messages and consumes the
  same generated contracts. No mobile-only operation kinds.
- **R-A3** `crates/skriuw-mobile` depends on domain, runtime, storage, sqlite,
  sync and crypto only. `skriuw-domain` gains no new dependency. The facade
  exposes narrow use cases, not table-shaped CRUD.
- **R-A4** Store, operation queue, tree and route logic exist once, in
  `shared/renderer-core`, consumed by `app/` and `mobile/`. Moving them changes
  no desktop behavior; `./scripts/check.sh` stays green throughout.
- **R-A5** Theme tokens are authored once in `themes.css`. The React Native
  token map is generated, committed and drift-checked. All nine themes ship.
- **R-A6** The editor is the desktop editor bundle, unforked. Mobile-specific
  behavior is configuration or CSS under the compact query, not a copy.

### Performance

`docs/performance-contract.md` applies unchanged. In particular:

- **R-P1** After startup, navigation never waits on the native module, the
  webview, disk, network or parsing. The working set is hydrated into the
  store once; opening a note is a same-frame store update.
- **R-P2** One editor webview is created at startup and kept warm. Switching
  notes sends a message; it never remounts the webview.
- **R-P3** Typing causes zero React Native renders outside the editor host and
  no synchronous native-module call.
- **R-P4** Cold start to interactive tree: 1.5 s P95 on the reference Android
  device with the 1,000-note fixture. Recorded in `docs/benchmarks/`.

### Product

- **R-F1** Notes: tree with folders, create, rename, move, delete with undo,
  pinned notes, note templates.
- **R-F2** Editor: full document fidelity with desktop, including properties,
  covers, mentions, tags, note links, code blocks, rendered Mermaid fences.
- **R-F3** Search: backend-ranked full-text search and saved searches.
- **R-F4** Journal: daily entries, mood, calendar, quick capture.
- **R-F5** Tasks: the tasks view with explicit promotion.
- **R-F6** Sync: sign-in, E2EE replication with automatic convergence,
  recovery surface, per-account workspaces.
- **R-F7** Locked notes with PIN/passphrase and optional biometric unlock. The
  lock key never leaves Rust unwrapped.
- **R-F8** Platform: share-to-Skriuw, home-screen quick actions, system theme,
  safe areas, hardware back on Android per ADR-0047 semantics.
- **R-F9** Remote AI actions reuse the completion seam (ADR-0033). Deferred
  past 1.0 unless it falls out of the editor bundle for free.

### Quality

- **R-Q1** Recovery-relevant failures (open, migration, sync, lock) stay
  visible and testable; the startup failure flow mirrors
  `shell/startup-failure.ts`.
- **R-Q2** Every screen is operable with VoiceOver and TalkBack; touch targets
  are at least 44 pt.
- **R-Q3** `scripts/check-mobile.sh` is the product gate: typecheck, unit
  tests, facade tests on the host, token and contract drift, Android emulator
  end-to-end. CI runs it on every PR touching `mobile/`, `shared/` or
  `crates/skriuw-mobile`.

## Layout

```text
crates/skriuw-mobile/          UniFFI facade over skriuw-runtime (host-testable)
mobile/                        Expo app: app/ routes only, src/ everything else
mobile/modules/skriuw-core/    Expo module: generated bindings, jniLibs, xcframework
mobile/src/bridge/             third implementation of the command surface + fake
mobile/src/shell/              toolbar, tab bar, sheets (native)
mobile/src/editor/             DOM component host and message protocol
shared/renderer-core/          store, operations, tree, routes (moved from app/src)
shared/theme/                  themes.css, generator, generated tokens.ts
scripts/check-mobile.sh        product gate
```

The repository root becomes a bun workspace over `app`, `mobile` and
`shared/*`. `v1/` is frozen and stays outside it.

## Command surface

Required for 1.0: bootstrap snapshot, submit operation and acknowledgement,
load and save document, search, search index status, journal queries, task
queries, note lock configure/unlock/state, media store/read, sync
connect/status/recovery, workspace slot selection, settings.

Refused with the same actionable error as `requireDesktopRuntime`: history,
backups, archive swap, provider import, local AI, external link window.

## Editor protocol

The host and the editor webview exchange serializable messages only:

| Direction | Message | Notes |
| --- | --- | --- |
| host → editor | `load { noteId, document, revision, theme }` | swaps state in place |
| host → editor | `theme { name }`, `remote-change { changeSet }` | no reload |
| editor → host | `change { noteId, document, revision }` | batched per ADR-0012 |
| editor → host | `navigate { noteId }`, `open-link { url }` | note links, external links |
| editor → host | `ready`, `failure { code, detail }` | bounded diagnostics |

The protocol is versioned and unit-tested against a browser harness before it
is exercised on a device.

## Known limits

- Expo DOM component props and messages must be serializable.
- iOS suspends sockets in the background; sync needs silent push and
  `BGTaskScheduler`, with a foreground catch-up as the correctness path.
- iOS cannot be built or simulated on Linux. EAS Simulator is limited-access;
  check `npx -y eas-cli@latest simulator:availability --json`. Android is the
  local verification target; iOS evidence comes from EAS builds.
- E2EE requires App Store export-compliance answers.

## Work breakdown

Issues in the same wave have disjoint owned paths and can run concurrently.

| Wave | Issue | Owns | Depends on |
| --- | --- | --- | --- |
| 0 | Mobile 01 Workspace and scaffold | root `package.json`, `mobile/` skeleton, `scripts/check-mobile.sh` | — |
| 1 | Mobile 02 UniFFI facade | `crates/skriuw-mobile` | — |
| 1 | Mobile 03 Extract renderer core | `shared/renderer-core`, `app/src/store` imports | 01 |
| 1 | Mobile 04 Theme token generator | `shared/theme`, `scripts/generate.sh` | 01 |
| 1 | Mobile 05 Editor bundle and protocol | `app/src/features/editor` entry, `mobile/src/editor/protocol` | 01 |
| 2 | Mobile 06 Expo native module | `mobile/modules/skriuw-core` | 02 |
| 2 | Mobile 07 Native shell | `mobile/src/shell`, `mobile/app` | 03, 04 |
| 2 | Mobile 08 Bridge adapter | `mobile/src/bridge` | 03, 06 |
| 2 | Mobile 09 Editor host | `mobile/src/editor` | 05, 07 |
| 2 | Mobile 10 CI and builds | `.github/workflows`, `mobile/eas.json` | 06 |
| 3 | Mobile 11 Search | `mobile/src/features/search` | 07, 08 |
| 3 | Mobile 12 Journal and capture | `mobile/src/features/journal`, share extension | 07, 08 |
| 3 | Mobile 13 Tasks | `mobile/src/features/tasks` | 07, 08 |
| 3 | Mobile 14 Sync and accounts | `mobile/src/features/sync`, facade sync surface | 08 |
| 3 | Mobile 15 Locked notes | `mobile/src/features/lock` | 08, 09 |
| 4 | Mobile 16 Release readiness | benchmarks, store metadata, docs | all |

Mobile 03 exports the bridge port and an in-memory adapter from
`shared/renderer-core`. Mobile 07, 09 and 11 to 13 build against that adapter,
so interface work never waits for the native module.
