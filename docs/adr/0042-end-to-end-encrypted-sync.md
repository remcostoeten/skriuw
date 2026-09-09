# ADR-0042: End-to-end encrypted sync

- Status: accepted
- Date: 2026-09-09

## Context

[ADR-0026](0026-optional-cloud-operation-replication.md) replicates versioned
domain operations through an ordered per-workspace log in a Cloudflare Worker
and Durable Object, with large bodies and media travelling as
content-addressed chunks ([sync content chunks v1](../specs/sync-content-chunks-v1.md)).
Every one of those payloads is plaintext today: the Durable Object's
`sync_operations.payload_json` holds note titles, document bodies, tags,
people, and task text, and R2 holds media bytes and whole workspace archives
as published checkpoints.

That is at odds with the product. Skriuw is local-first: SQLite is canonical,
navigation and editing never wait on the network, and
[ADR-0037](0037-automatic-sync-convergence.md) moved convergence entirely
client-side onto facts both devices already share. The service therefore never
needs to read a payload to do its job. It needs to order operations, refuse
duplicates, account for bytes, and hand the same bytes back. Everything else
it currently sees, it sees only because nobody sealed it.

`docs/specs/cloud-sync-master.md` carried this as an open decision before
public beta (issue #342).

## Decision

Workspace content is sealed on the client before it is pushed and opened on
the client after it is pulled. The sync service stores, orders, and returns
opaque bytes.

### Key model

- One symmetric **workspace content key** (32 bytes) seals everything for one
  workspace.
- The key is derived, not stored anywhere but on the devices that hold it:
  `key = Argon2id(recovery code, salt = SHA-256("skriuw-sync-e2ee-salt-v1" ‖ workspace id))`,
  with m = 19 MiB, t = 2, p = 1.
- The **recovery code** is 160 bits of platform entropy rendered as 32
  Crockford base32 symbols in eight groups of four. It is shown once, at
  enable time, and never stored. Deriving the key from the code plus the
  workspace identity is what lets a second device join by typing the code and
  nothing else — no wrapped key ever has to reach the server.
- The account password is deliberately **not** an input. Password reset,
  session theft, and a compromised auth service therefore cannot yield the
  content key.
- `key_id` is the first 8 bytes of `SHA-256("skriuw-sync-e2ee-key-id-v1" ‖ key)`,
  in hex. It travels in the clear so a device holding the wrong code fails
  with "this device holds key …" instead of an authentication-tag failure.
- Sealing is XChaCha20-Poly1305. The AAD binds each blob to its slot
  (`skriuw/sync/operation/<workspace>/<operation id>`,
  `…/asset/<workspace>/<operation id>/<content hash>`,
  `…/checkpoint/<workspace>/<server sequence>`), so ciphertext cannot be
  replayed into a different operation, asset, or workspace.
- Nonces are **derived, not random**:
  `nonce = SHA-256("skriuw-sync-e2ee-nonce-v1" ‖ key_id ‖ len(context) ‖ context ‖ SHA-256(plaintext))[..24]`.
  This keeps `skriuw-crypto` free of any random-number dependency, so it
  compiles unchanged for `wasm32-unknown-unknown`, and it makes re-sealing an
  operation byte-identical, which the service's idempotent-push rule (same
  operation id must carry the same content) requires. The cost is accepted and
  stated below.

### Metadata boundary

Sealed — the service cannot read any of it:

- note titles, document JSON and Markdown, word counts
- tags, people, note properties, annotations and their comments, tasks,
  prompts
- the operation *type* itself
- image and video bytes, their mime types, and their content digests
- entity identifiers (note ids, folder ids, tag ids)
- the whole workspace archive behind a published checkpoint

Visible — the service reads and relies on it:

- `workspaceId`, `deviceId`, `operationId`, `clientSequence`,
  `baseServerSequence`, `serverSequence`
- ciphertext size, chunk count, chunk digests (over ciphertext), and total
  stored bytes for quota
- `keyId`, `scheme`, `nonce`
- request timing, and the acknowledged cursor per device

Two consequences of this boundary are explicit, not accidental:

1. **The service can no longer enforce operation policy.** It cannot reject a
   `device_local` operation or an unsupported operation type by name, because
   it cannot read the name. Enforcement moves to the client, which validates
   the queued payload against the replication policy *before* sealing and
   validates the opened envelope again *after* opening. The service keeps
   enforcing everything that does not require reading: identity, sequencing,
   duplicate detection, size ceilings, chunk presence, and quota.
2. **The service can no longer cross-check an `attach_image` asset against its
   manifest**, since the declared digest is sealed. The client verifies the
   opened bytes against the digest the opened operation declares before
   storing them, which is the check that actually matters.

What deterministic sealing reveals: two identical plaintexts in the same slot
produce identical ciphertext. Because operation identifiers are unique and
operations are immutable, this reduces in practice to "re-pushing the same
operation looks the same", which is the behavior the idempotency rule already
requires. It does not reveal equality of two different notes' bodies, because
the slot (and therefore the AAD and the nonce) differs.

### Wire format

A third payload form rides the existing sync protocol version 2 rather than a
new protocol version:

```json
{ "form": "sealed",
  "operation": { "scheme": "argon2id-xchacha20poly1305-v1",
                 "keyId": "0f1e2d3c4b5a6978",
                 "nonce": "…",
                 "transport": "inline", "ciphertext": "…" },
  "assets": [ { "…": "…", "transport": "chunked", "manifest": { "…": "…" } } ] }
```

Ciphertext above the inline ceiling travels through the existing chunk
transport, with digests taken over ciphertext and the opaque mime type
`application/octet-stream`. A checkpoint gains an optional `seal` object; when
present, its content manifest describes ciphertext.

Bumping `WORKSPACE_SYNC_PROTOCOL_VERSION` was rejected: the client refuses a
response whose version is not the newest it knows, so a bump would break every
released client against the updated Worker, including workspaces that never
enable encryption. A new payload form is inert for those workspaces.

### Where the boundary sits

`skriuw-sync` seals a claimed batch after it leaves the durable outbox and
opens a pulled page before it reaches the apply path. Everything above —
SQLite, reconcile, conflict review, search, export, history — keeps seeing
plaintext, and local canonical state stays unencrypted at rest. Local disk is
not in this threat model: the notes are already readable on the device that
wrote them, and encrypting them there would trade a real recovery story for no
attacker the service does not already exclude.

The derived key is cached in the device-local `sync_encryption` table
(migration `0025`) so the recovery code is entered once per device. It is
never replicated: `WorkspaceOperation` has no variant that carries it.

### Failure behavior

Recovery-relevant failures stay visible, per the repository rules:

- a device with no key that pulls sealed content parks as
  `blocked { reason: "encryption_key_required" }`
- a wrong recovery code, a tampered ciphertext, or an unknown scheme parks as
  `blocked { reason: "sealed_content_unreadable" }` with the crypto layer's
  actionable message

Neither is retried into a loop, and neither applies anything.

### Migration and recovery

- Enabling encryption on a workspace that already replicated in the clear
  seals everything pushed from that moment, and forces a sealed checkpoint at
  the next cycle regardless of the publication interval. The service's
  existing retention pass compacts the plaintext log below the acknowledged
  floor once every active device has caught up, and sweeps the unreferenced
  plaintext chunks after the 24-hour grace period. Until that completes, the
  operations the service already accepted remain readable; the settings
  surface says so.
- Turning encryption **off** is not offered. It would mean re-pushing the
  whole workspace in the clear, and the honest alternative — stop sealing new
  work while old sealed work stays unreadable to keyless devices — is worse
  than not offering it.
- Losing the recovery code loses the cloud copy and nothing else. Local
  canonical state is untouched, and a device that still holds the key can
  export a portable archive.
- Rotating the code means deriving a new key and re-pushing, which is the same
  work as the initial migration. It is not implemented yet.

## Consequences

- The Worker and Durable Object cannot be subpoenaed, mis-configured, or
  breached into revealing note content for an encrypted workspace. Their
  logs already carry no content (`logSyncSecurityEvent` keeps only server-chosen
  codes); now their storage carries none either.
- Server-side search, server-side merge, and any future server-rendered
  preview are permanently unavailable for encrypted workspaces. None of them
  exist, and ADR-0037 already put merge on the client.
- Argon2id at 19 MiB runs once per device per unlock, off every interaction
  path, in the sync worker thread or the browser storage worker. Sealing and
  opening are XChaCha20-Poly1305 over payload-sized buffers on the same
  background path; the performance contract's navigation and editing budgets
  are untouched because the cycle never runs on them.
- Inviting collaborators to an encrypted workspace requires distributing the
  content key to other accounts, which this ADR does not solve. Group key
  distribution is a follow-up, and it must land before shared workspaces do.
- A device running an older Skriuw build against a workspace that has been
  encrypted will reject the sealed payload as an unsupported form and park.
  That is correct: it has no key and could not apply the operation anyway.
