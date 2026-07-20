# Desktop local-first architecture

Skriuw runs one product across three storage backends behind a single interface.
The desktop build is the Obsidian-class one: **local-first, private, offline**.
This document records the deciding constraints and — because most of it is already
built — maps each decision to the code that implements it, then lists the gaps
that are genuinely still open.

## Positioning

Skriuw wins on **local ownership + privacy**, not collaboration. The web build keeps
cloud, sharing, and real-time collaboration; the desktop build deliberately does
not. Obsidian is the benchmark for the desktop experience only.

## One interface, three backends

Feature code never branches on platform or auth. It talks to `WorkspaceBackend`
(`apps/web/src/core/workspace-backend/types.ts`), which advertises a
`capabilities` set so the UI hides surfaces a backend can't serve.

| Backend  | File                | Storage                          | Role                      |
| -------- | ------------------- | -------------------------------- | ------------------------- |
| `server` | `server-backend.ts` | Prisma / Postgres                | Authenticated web user    |
| `local`  | `local-backend.ts`  | `localStorage` + seed            | Unauthenticated web guest |
| `tauri`  | `tauri-backend.ts`  | Rust: `.md` vault + SQLite index | Desktop                   |

Desktop capabilities (`tauri-backend.ts`): `sharing: false`, `collaboration: false`,
`ai: true`, `journal/trash/history: true`. Sharing and collaboration are
server-bound and therefore off — the capability flag is what greys them out.

## Desktop storage model

Two Rust stores, one source of truth:

- **`vault.rs` — the source of truth.** Notes are real `.md` files with YAML
  frontmatter; folders are directories. Identity (`id`) lives in frontmatter, so a
  rename on disk preserves the note and a move between folders re-parents it.
  Journal, trash, and folder metadata live under `.skriuw/`.
- **`storage.rs` — a derived index.** SQLite (`index.db`) with FTS5 for
  `searchNotes`, the backlink graph (`get_backlink_sources`), and version history.
  Rebuilt from the vault by `reconcile_index` on launch (deferred to a background
  thread when `index.db` already exists; the frontend waits on the
  `index://reconciled` event).

Writes are dual-write, vault first: `lib.rs::save_note` performs exactly two
top-level operations — the canonical vault commit, then one derived-index
SQLite transaction. If the index is ever lost or corrupted, `reconcile_index`
reconstructs it from the vault — the markdown is authoritative.

### Durability model

- **Atomic canonical writes.** Every vault file — note Markdown, journal
  Markdown, `folders.json`, `trash.json`, journal tags, cover assets — is
  replaced through `atomic_file::atomic_write`: a uniquely named sibling
  temporary file is written, `sync_all`-flushed, then renamed over the
  destination (`MoveFileExW` with `MOVEFILE_REPLACE_EXISTING | WRITE_THROUGH`
  on Windows, `rename(2)` elsewhere, parent directory fsynced on Unix). A crash
  or write error at any stage leaves the complete old file or the complete new
  file, never a truncated mixture, and cleans up the temporary file.
- **Rename/move installs before it deletes.** When a note or journal entry
  moves to a new path, the new file is durably installed first and only then is
  the old path removed. If that removal fails, both complete files are kept and
  the error names both paths — duplicate cleanup is safer than data loss.
- **One SQLite transaction per logical save.** `Storage::save_note_index`
  commits the note row, its link/title rows, and the version-history decision
  together; a failure rolls all of them back. SQLite is never treated as part
  of a cross-filesystem transaction — it stays a derived index.
- **Detectable index lag.** If the derived transaction fails after the vault
  commit, the save returns an error stating the note file was saved but the
  index refresh failed, emits `index://dirty`, and reruns `reconcile_index`
  off the command thread (completion flagged via `index://reconciled`). A
  restart repairs the note row through the launch reconcile, and missing link
  rows through the frontend link backfill (`list_unindexed_note_ids`).

## Desktop settings

Desktop configuration is owned by the typed Rust `SettingsStore` in
`apps/desktop/src-tauri/src/settings.rs`. The current schema is version 1 and
contains the optional vault and cover roots plus non-secret AI configuration.
Unknown top-level and AI fields are retained across updates so settings written
by another compatible release are not erased. Secrets are deliberately outside
the long-term typed schema. Legacy plaintext credentials are exposed only to a
one-way migration that verifies OS credential-store persistence before deleting
the old value.

Every mutation holds one process-wide write lock for clone, validation, atomic
file replacement, and in-memory publication. A failed disk write therefore
leaves both the previous file and the previous in-memory snapshot intact. A
missing file starts with defaults in memory and is created on the first update.

Malformed JSON is copied byte-for-byte to a unique sibling named
`settings.corrupt-*.json`. The desktop then starts with safe defaults in an
explicit read-only recovery mode: diagnostics and the Local Data settings panel
show the affected path and error, and no command may overwrite the malformed
file. A settings version newer than this build supports uses the same read-only
mode without replacing the file. Repair the original `settings.json` or open it
with a newer Skriuw release, then restart the app.

## Sync

Decision: **local-first by default, cloud sync only after explicit consent.** Backup restore is staged and non-destructive (DH-02): vault and full-snapshot
restores are inspected, extracted into marker-tagged staging directories on the
same filesystem, and validated before any live root is touched. Commit swaps
each live root aside into a rollback directory; a failed rebind rolls every
root back in reverse order, and the previous workspace is kept until the
restored one has reconciled and passed a smoke read. Abandoned staging/rollback
directories are cleaned at the next launch, after reconciliation.

The pull seam
— `importArchive` (`ImportArchivePayload`) — applies a full workspace pull,
including `deletedIds` tombstones, in one transaction
(`storage.rs::import_workspace`). The `Note` row already carries `id` (uuid),
`created_at`, and `modified_at`; deletes are tombstoned through the trash and the
pull payload. That is enough for last-write-wins reconciliation.

The push half uses a writable, revocable sync credential created automatically
through Better Auth's browser device flow. Desktop opens the normal web sign-in,
so GitHub and the user's existing browser session work without credentials ever
entering the desktop webview. Connecting the account does not enable sync. After
the user separately opts in, desktop uploads its snapshot and then pulls the merged cloud workspace. Later
syncs run every two minutes while online. A successful baseline records ids so
later local deletions can be propagated safely; failed requests leave local files
untouched and retry. Concurrent note edits preserve the desktop body as a dated
conflict copy rather than choosing a silent winner.

The pairing bearer is stored under the same OS credential-store service as AI
keys (`sync:device`), never in the webview store after migration. Disconnect and
credential-inclusive reset remove it from the keychain. If secure storage is
locked or unavailable, sync stays disconnected rather than falling back to
plaintext.

## AI

Desktop default is **local Ollama** (private, offline). Cloud AI is optional and,
for v1, **bring-your-own-key only** — Skriuw's own fallback keys cannot ship inside
a desktop binary and a proxy would require the server we are deliberately not
shipping yet. Enabling cloud AI sends note text off the machine, so it must sit
behind an explicit consent toggle; "fully private" holds only in Ollama mode.
Both the settings UI and Rust command boundary enforce that consent, and the UI
states plainly that note text leaves the device. Withdrawing consent immediately
blocks cloud calls. Missing local Ollama disables local actions, explains the
condition, and offers the supported managed install/start flow; it never causes
a silent cloud fallback.

Provider API keys are stored in the **OS credential store** (macOS Keychain,
Windows Credential Manager, Linux Secret Service) via `credentials.rs` (DH-03),
never in `settings.json`, snapshots, or logs. The service name is
`nl.remcostoeten.skriuw` (`.dev`-suffixed in debug builds); accounts are
`ai:groq` and `ai:gemini`. A legacy plaintext key from an older build is
migrated on launch — stored securely and read back before the plaintext is
removed — and cloud AI has no plaintext fallback: an unavailable credential
store disables cloud providers while Ollama keeps working. Complete snapshots
intentionally exclude these keys (they live outside app-data); a reset only
removes them when the user explicitly opts in.

### External edits, live reconciliation, and conflict-safe saves

Provider keys aside, the vault is a folder of plain Markdown that other tools can
edit. Saves are **conflict-safe** (DH-08 Phase 1): every desktop note read
records the file's content-derived revision (`note_vault_revision`, a SHA-256 of
the canonical bytes), and `save_note` carries that `expectedVaultRevision`. Rust
re-reads the file's current revision under the vault write lock immediately
before writing; if it no longer matches, the save is rejected
(`VAULT_CONFLICT:<id>`) and the external content is left untouched rather than
overwritten. An explicit `force` flag exists for a future "keep my version"
resolution and is never set by autosave.

The desktop recursively watches the configured vault. Note events are debounced
and reconciled by path; stable frontmatter ids preserve identity across external
rename/move. Folder and journal metadata use a convergent bounded reconcile, and
watcher errors or very large bursts fall back to one full rescan. Events carry
ids and invalidation flags, never note bodies. Ordinary internal saves are
suppressed once by exact path + content revision, so a later external edit at the
same path cannot be hidden. The watcher pauses around restore/reset, rebinds on a
live vault-root change, and joins on shutdown. Data settings shows active,
rescanning, degraded, or stopped state and provides Rescan/Restart actions.

A clean active editor refreshes and shows “Updated from disk”. A saving/error
editor remains mounted and enters a persistent conflict state. If its stale save
reaches Rust, the external file remains canonical and the local draft is first
written as a uniquely named, timestamped conflict-copy note with a new id. Thus
closing the window cannot discard either body; the banner also offers copying
the mounted draft. Its resolution actions are **Compare versions** (opens the
preserved draft beside the disk note), **Keep disk** (loads canonical disk and
retains the draft copy), and **Keep mine** (first copies the disk body, then uses
the sole explicit force-save path). Resolving also discards the stale autosave
queue entry so it cannot recreate the conflict.

### Structured editor sidecars

Block-editor-only `richContent` is persisted crash-safely at
`.skriuw/rich/<note-id>.json`. Each sidecar stores the SHA-256 revision of the
exact Markdown bytes it accompanies. Markdown is still canonical: when another
editor changes the file, the hash no longer matches and Skriuw ignores the stale
structure and derives a new rich document from Markdown. Markdown is committed
first and both files use atomic replacement, so a crash between commits degrades
to safe derivation instead of applying old structure to a new body. Sidecars move
through trash/restore, are removed on purge/delete, and are included in vault
backups and full snapshots.

## Desktop updates

The Tauri updater is opt-in at release-build time. `SKRIUW_UPDATE_ENDPOINT` must
be HTTPS and `SKRIUW_UPDATE_PUBKEY` must contain the updater verification key;
when either is absent, the app reports an unconfigured state and makes no update
request. Settings can check, show release notes, and install a signature-verified
update. Normal local builds do not need release secrets; CI uses
`bun run --cwd apps/desktop build:release`, publishes each installer with its
`.sig`, and serves Tauri-compatible update JSON.

## Open gaps

1. **Read path still goes through SQLite.** The stale `vault.rs` header was
   corrected in DH-01; the vault-authoritative-on-conflict invariant now holds
   through atomic writes plus reconcile/backfill repair, but reads still serve
   from the derived index.
2. **External release infrastructure.** Repository support for signed updates is
   complete, but production still needs a protected updater private key, hosted
   artifacts/update JSON, Apple signing and notarization, and a Windows
   code-signing certificate.
