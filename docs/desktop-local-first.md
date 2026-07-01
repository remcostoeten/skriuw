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

| Backend | File | Storage | Role |
| --- | --- | --- | --- |
| `server` | `server-backend.ts` | Prisma / Postgres | Authenticated web user |
| `local` | `local-backend.ts` | `localStorage` + seed | Unauthenticated web guest |
| `tauri` | `tauri-backend.ts` | Rust: `.md` vault + SQLite index | Desktop |

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

Writes are dual-write, vault first: `lib.rs::create_note` calls
`vault.upsert_note` then `storage.upsert_note`. If the index is ever lost or
corrupted, `reconcile_index` reconstructs it from the vault — the markdown is
authoritative.

## Sync

Decision: **ship serverless now (silos), add sync later.** The pull seam already
exists — `importArchive` (`ImportArchivePayload`) applies a full workspace pull,
including `deletedIds` tombstones, in one transaction
(`storage.rs::import_workspace`). The `Note` row already carries `id` (uuid),
`created_at`, and `modified_at`; deletes are tombstoned through the trash and the
pull payload. That is enough for last-write-wins reconciliation.

What is missing is the **push** half and a conflict policy — see gaps.

## AI

Desktop default is **local Ollama** (private, offline). Cloud AI is optional and,
for v1, **bring-your-own-key only** — Skriuw's own fallback keys cannot ship inside
a desktop binary and a proxy would require the server we are deliberately not
shipping yet. Enabling cloud AI sends note text off the machine, so it must sit
behind an explicit consent toggle; "fully private" holds only in Ollama mode.

## Open gaps

1. **Sync push + conflict policy.** Only the pull direction is built. Two-way sync
   needs a desktop→cloud push and an explicit LWW-vs-merge decision. The seam
   (stable ids, `modified_at`, tombstones) is in place; the transport and the
   merge rule are not.
2. **`richContent` is not persisted in the vault.** It is derived from the markdown
   on read (`rich-document.ts`), so block-editor-only structure is lossy on a
   desktop round-trip. Decide: accept lossy markdown-canonical, or add a
   `.skriuw/rich/<id>.json` sidecar.
3. **Read path still goes through SQLite, and `vault.rs`'s header comment is
   stale** (it claims it is "not yet wired into the live IPC commands" while
   `lib.rs` already dual-writes to it). Confirm the vault-authoritative-on-conflict
   invariant and correct the comment.
4. **Ollama absence UX.** `capabilities.ai` is `true`, but the degrade path when no
   Ollama daemon is on `localhost:11434` needs to be explicit: greyed action plus a
   one-click in-app install trigger, never a silent failure.
5. **Cloud-AI consent surface.** The BYO-key cloud path needs the privacy consent
   toggle and a clear "text leaves this device" label before it is enabled.
