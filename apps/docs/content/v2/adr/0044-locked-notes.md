---
title: "ADR-0044: Locked notes"
---

- Status: accepted
- Date: 2026-09-16

## Context

Users asked to put a PIN or passcode on a single note or a whole folder. Two
very different features answer that request. A privacy screen hides a note
behind a prompt while its body stays readable in the SQLite file, in search
snippets, in backlinks, and in the history repository. Encryption at rest makes
the body unreadable to anything that does not hold the key.

[ADR-0043](/v2/adr/0043-end-to-end-encrypted-sync) deliberately kept local disk out
of its threat model: its content key is derived from the sync recovery code,
exists only for cloud-connected workspaces, and is cached unwrapped on the
device so the code is typed once. That key therefore cannot protect a note from
someone holding the device, and a purely local workspace does not have it at
all. Locked notes need their own key.

The renderer loads every note body eagerly at startup and keeps them in the
store, and half a dozen projections read bodies: the full-text index,
`document_references`, tasks, history capture, previews, archives. Whatever
"locked" means has to be enforced where those bodies come from, not in the
components that display them.

## Decision

A note lock is real encryption at rest with a session-scoped key, modelled on
Apple Notes rather than on a phone PIN.

### One secret, one key

- The workspace has at most one **note lock**: a user-chosen secret that is
  either a numeric **PIN** (at least four digits) or a **passphrase** (at least
  six characters). Every locked note is protected by the same secret. Per-note
  secrets were rejected: they multiply recovery failures and invite four-digit
  codes.
- The secret never touches a body directly. A random 32-byte **lock content
  key** seals bodies. The secret and a **recovery code** each derive a wrapping
  key with Argon2id (19 MiB, t = 2, the parameters ADR-0043 already fixed), and
  the content key is stored twice, sealed under each. Only the wraps, the salt,
  the kind, the hint, and the key id are stored (`note_lock`, migration 0027).
- The recovery code is 160 bits in the same Crockford form as the sync code,
  shown once at setup and never stored. Forgetting the secret is recoverable
  from the code; losing both makes locked bodies unreadable for good, and the
  setup dialog says so before the code is dismissed.
- Sealing reuses `skriuw-crypto`: XChaCha20-Poly1305 with derived nonces, AAD
  `skriuw/lock/document/<note id>` for bodies and `skriuw/lock/key/<secret|recovery>`
  for wraps. The crate gained `derive_key_from_secret` and
  `derive_key_from_recovery_code` for caller-held salts; nothing else changed.
- The lock configuration replicates as a `ConfigureNoteLock` operation. It
  carries ciphertext only, so a second device unlocks with the same secret.
  Attempt counters stay device-local.

### Sealed bodies are the canonical body

- `documents` gains `sealed_body`, `sealed_nonce`, and `sealed_key_id`. While a
  note is locked its plaintext columns hold an empty document, an empty
  Markdown string, and a word count of zero. The renderer receives the same
  placeholder plus a `sealed` marker, so the snapshot never carries a locked
  body, and neither does an archive, a checkpoint, or a delta.
- Two operations carry the state: `SetNodeLocked { id, locked }` flags a note
  or a folder and everything under it, and `SaveSealedDocument` writes a
  ciphertext body. Both replicate. A device holding the key can open a sealed
  save; every other device stores it as is.
- Renderer-submitted operations are **expanded** by the SQLite adapter before
  they apply and before they enter the sync outbox. Locking emits a sealed
  save for every covered note whose body is still plaintext, then the flag.
  Unlocking emits the flag, then a plaintext save for every sealed body. A
  `SaveDocument` for a locked note becomes a `SaveSealedDocument`. A note
  created in, moved into, or restored into a locked folder is sealed and
  flagged. Generated operations are final and are never expanded again.
- Applying a sealed save scrubs every plaintext projection of the note: the
  FTS row, its outgoing references, and its tasks are deleted, no history is
  captured, and pending history captures are discarded when a note locks.
  Images stay attached because pruning them would need the body. Applying a
  plaintext save clears the sealed columns and rebuilds the projections, so
  unlocking a note permanently restores search, backlinks, tasks, and history.
- Locking requires each covered body to be sealed already or the applying
  device to hold the key. A device with neither refuses the operation rather
  than flag plaintext as locked. Plaintext saves for a locked note without the
  key are refused the same way, so a stray editor save can never overwrite a
  sealed body.
- Connections run with `PRAGMA secure_delete = ON`, so the freed pages that
  held a body, its FTS tokens, and its history rows are zeroed rather than left
  in the file. An integration test reads the database file back and asserts
  the body is gone.

### The session

- The opened content key lives in `LockSession`, an in-memory field of the
  SQLite adapter, and nowhere else. A process starts locked. `NoteLockAccess`
  (in `skriuw-storage`) is the only surface: state, configure, unlock, recover,
  change secret, relock, read locked documents, remove. The runtime executes
  these on the storage thread, so Argon2id never blocks the renderer and the
  key derivation runs without holding the connection.
- Wrong secrets are counted. Three attempts answer immediately; then the next
  attempt waits 30 seconds, two minutes, ten minutes, and thirty minutes at
  most. There is no permanent lockout: the owner can always wait, and an
  attacker with the file bypasses the counter anyway. The hint is shown only
  after the first miss.
- The renderer keeps a `noteLock` slice with what the unlock screen needs and
  nothing else. When the session unlocks, the renderer fetches the opened
  bodies and applies them as a delta; whenever a sealed placeholder reappears
  while the key is held (a sync delta, a re-bootstrap) it fetches again. On
  relock the renderer flushes pending saves, drops the key, and puts the
  placeholders back. An idle timer (default five minutes, configurable, zero
  disables) and optionally window blur relock.
- The editor never mounts behind a sealed note. `EditorHost` swaps in an unlock
  pane and hands the editors a selector that returns no note, so nothing can
  save over a sealed body. Export, share, and duplicate refuse a sealed note.
- Desktop sync applies remote operations over its own connection, which holds
  no key. A remote plaintext save to a locked note therefore parks as a visible
  conflict instead of being sealed silently; the browser runtime shares one
  adapter with sync and can seal it.

## Consequences

- Locking is honest: the body leaves the file, the index, the graph, the task
  list, and future history. Titles, timestamps, placement, properties, covers,
  and attached media stay visible by design; the sidebar shows a lock badge.
- History recorded **before** a note locked stays in the Git repository. The
  lock discards captures that have not been materialized yet, but it does not
  rewrite history. This is documented rather than solved.
- Tasks derived from a locked note's checklist are deleted when it locks and
  recreated from the document when it unlocks, so the task view cannot leak
  checklist text. Standalone tasks are untouched.
- Word counts of locked notes read as zero, and the metadata panel, journal
  search, and trash previews see an empty body. That is the intended shape of
  "locked".
- Removing the lock is offered and requires the key: every locked note is
  unlocked permanently first, then the configuration is deleted. Rotating the
  recovery code is not offered; changing the secret re-wraps the same key and
  keeps the code valid.
- The lock does not protect against an attacker who reads memory while the
  session is unlocked, nor does it make the encrypted-sync gaps of ADR-0043
  smaller. It is one secret against a lost or shared device.
