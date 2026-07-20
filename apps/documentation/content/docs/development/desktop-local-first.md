---
title: "Desktop local-first architecture"
description: "How the Tauri desktop app keeps a Markdown vault authoritative while providing live reconciliation, private AI, optional sync, and signed updates."
---

Skriuw desktop is local-first, private, and offline-capable. It shares product
features with web through `WorkspaceBackend`, but the desktop backend treats a
user-owned Markdown vault as the source of truth.

## Storage model

Desktop uses two stores:

- **Vault** (`vault.rs`) - real Markdown files with YAML frontmatter. Stable IDs
  in frontmatter preserve a note across renames and moves. Journal, trash, and
  folder metadata live beneath `.skriuw/`.
- **SQLite index** (`storage.rs`) - derived FTS, backlinks, and history. It can be
  rebuilt from the vault after corruption or lag.

Canonical writes are atomic: write a sibling temporary file, flush it, then
replace the destination. A note save commits the vault first and refreshes the
derived index afterward. An index failure never means a note body was lost.

## Structured editor sidecars

Markdown is portable, but some block-editor structure cannot be represented in
plain Markdown alone. Desktop stores that structure in
`.skriuw/rich/<note-id>.json` sidecars.

Each sidecar records the SHA-256 revision of the exact Markdown it belongs to.
When another app changes the Markdown, the revision no longer matches and
Skriuw safely derives a fresh rich document instead of applying stale structure.
Sidecars move through trash and restore, are purged with their note, and travel
in vault backups and full snapshots.

## External edits and conflicts

The vault is designed to be edited by other tools. Desktop recursively watches
the configured vault and debounces events by path. Stable frontmatter IDs let it
recognize external rename and move operations; metadata changes use a bounded
reconcile, while large bursts and watcher errors fall back to a full rescan.

Events carry IDs and invalidation flags, never note bodies. Internal saves are
suppressed once using their exact path and revision, so a subsequent external
edit is not hidden.

Every loaded note carries a content-derived vault revision. A save with a stale
revision is rejected rather than overwriting the file on disk. If a stale draft
has already been edited locally, Skriuw first preserves it as a uniquely named,
timestamped conflict-copy note with a new ID. The editor keeps both versions
available and can copy the mounted draft. Data settings exposes active,
rescanning, degraded, and stopped watcher state with **Rescan** and **Restart**
actions.

## Sync and credentials

Sync is opt-in. Browser device flow connects an account; the user then separately
enables snapshot push/pull. Local deletions are tracked after a successful
baseline, and concurrent edits preserve a conflict copy instead of silently
choosing one body.

The desktop sync bearer is stored as `sync:device` in the OS credential store.
Legacy webview storage is migrated one way only after the secure value is read
back successfully. Disconnect and credential-inclusive reset remove it. A locked
or unavailable keychain leaves sync disconnected; it never falls back to
plaintext.

## AI privacy

Local Ollama is the default desktop provider. It works offline and keeps note
text on the device. When Ollama is unavailable, local actions are disabled with
an explanation and supported install/start controls; there is no automatic cloud
fallback.

Cloud AI is bring-your-own-key and requires explicit consent in both the UI and
Rust command boundary. Settings states that note text leaves the device, and
withdrawing consent blocks cloud calls. AI keys live in the OS credential store,
outside settings files, snapshots, and logs.

## Signed updates

The updater is configured only for release builds. It needs an HTTPS
`SKRIUW_UPDATE_ENDPOINT` and `SKRIUW_UPDATE_PUBKEY`. Without both, desktop shows
an unconfigured state and makes no network request. With both, Data settings can
check, show release notes, and install signature-verified updates.

Local builds do not need signing secrets. A release uses:

```sh
bun run --cwd apps/desktop build:release
```

CI must provide the protected updater private key, publish installers with their
`.sig` files, and serve Tauri-compatible update JSON. Production distribution
also needs Apple signing/notarization and a Windows code-signing certificate.

## Remaining architecture gap

The read path still serves from the derived SQLite index. The vault remains
authoritative for writes and conflict checks, but direct vault reads are the next
architectural improvement for the strictest local-first model.
