# Sync content, checkpoint, and retention operations

Status: implemented for the Worker and client contracts. Operational values
below are defaults in code, not a deployed configuration record.

This document covers running the content-addressed chunk store, checkpoints,
and log retention. The wire formats are defined in
[content-addressed chunk transport v1](sync-content-chunks-v1.md); the trust
boundary is defined in
[cloud sync authentication](cloud-sync-authentication.md).

## Bindings and resources

| Binding | Resource | Purpose |
| --- | --- | --- |
| `SYNC_CONTENT` | R2 bucket `skriuw-v2-sync-content` | chunk bytes |
| `WORKSPACES` | Durable Object `WorkspaceSyncObject` | ordered log, checkpoints, cursors |
| `AUTH_DB` | D1 `skriuw-v2-auth` | accounts, membership, devices |

Creating the bucket is a one-time operation and is not performed by any
automated check:

```bash
cd cloud
bunx wrangler r2 bucket create skriuw-v2-sync-content
bunx wrangler deploy
```

Until the bucket exists, chunk routes fail and any push carrying a chunked
payload is rejected with `content_unavailable`. Inline sync is unaffected.

## Routes

All routes sit under `/v1/workspaces/:workspaceId/` and require a Better Auth
bearer plus membership. Authorization always runs before the Durable Object is
resolved.

| Route | Method | Permission | Behavior |
| --- | --- | --- | --- |
| `chunks/:digest` | `PUT` | push | Stores bytes only if they hash to `:digest` |
| `chunks/:digest` | `HEAD` | pull | Existence probe for resume and dedup |
| `chunks/:digest` | `GET` | pull | Returns verified bytes |
| `checkpoint` | `POST` | push | Publishes a checkpoint, then compacts |
| `checkpoint` | `GET` | pull | Returns the latest checkpoint record |
| `acknowledge` | `POST` | pull | Advances a device cursor |
| `push` / `pull` | `POST` / `GET` | push / pull | Ordered log, unchanged |

Chunk bodies are bounded to one canonical chunk (1 MiB). A chunk request whose
digest is not 64 lowercase hex characters does not match a route at all.

## Quotas and limits

| Limit | Value |
| --- | --- |
| Chunk body | 1 MiB |
| Chunks per manifest | 256 |
| Content per manifest | 256 MiB |
| Sync batch | 64 operations / 8 MiB |
| Retained checkpoints | 2 |
| Device idle expiry | 30 days |

## Deduplication and isolation

Chunk keys are `workspaces/<workspaceId>/chunks/<digest>`. Deduplication is
therefore **workspace-scoped**: two workspaces holding identical bytes store two
objects. This costs storage but removes a whole class of cross-tenant
information leaks — a caller cannot learn whether another workspace holds given
content, because the key it would probe does not exist in its own namespace and
authorization is checked against the path workspace before any R2 access.
Global deduplication would require a reference-counted shared namespace and an
authorization check that cannot be satisfied by possession of a digest; it is
deliberately not implemented.

## Retention and compaction

Compaction runs inside the workspace Durable Object after a checkpoint is
published. The object is single-threaded per workspace, so compaction never
races a push.

An operation is removable only when **both** hold:

- its server sequence is at or below the oldest retained checkpoint, so a new
  device can still hydrate without it; and
- its server sequence is at or below every active device cursor, so no known
  device still needs to receive it.

With no retained checkpoint nothing is removable, because a device with no
checkpoint would have to replay from zero. A device that has not acknowledged
within the idle window is expired and stops pinning the log; it recovers by
hydrating from a checkpoint rather than by replaying, which is why expiry is
safe but not free.

A chunk is deleted only after every reference to it is gone. References are
tracked in `sync_chunk_refs` per operation and per checkpoint, and are removed
in the same transaction that removes the referring row. Orphans are computed
from that table before the R2 delete, so a chunk reachable from a retained
operation or checkpoint is never collected.

Client-side tombstones, unresolved conflicts, and recovery artifacts are **not**
governed by this policy. They live in the local database and are covered by
[sync convergence v1](sync-convergence-v1.md); server compaction cannot remove
them and must never be assumed to.

## Observability

`logSyncSecurityEvent` emits one JSON line per rejected or failed request with
the route name, stable error code, status, and method. It never logs content,
digests, tokens, workspace contents, or subjects. Content bytes are not
logged anywhere; a digest identifies content and is treated as content-derived
data, so it stays out of logs by design.

Push and checkpoint rejections that indicate missing content use the stable
`content_unavailable` code, which distinguishes a resumable transfer problem
from a contract violation (`sync_rejected`).

## Recovery procedures

**Interrupted upload.** Re-`HEAD` each manifest digest and re-`PUT` only what is
missing. Uploads are idempotent and content-addressed; a partially uploaded
manifest never produces a published operation, because push verifies every
chunk before appending.

**Corrupt or tampered content.** `GET` re-verifies the digest server-side and
the client verifies again through `ContentManifest::verify_assembled`, which
checks length, every chunk digest, and the whole-content digest. A mismatch on
either side is a hard failure; the operation or checkpoint is not applied.

**Failed hydration.** `hydrate_from_checkpoint` is refused unless the device has
an active connection, a zero cursor, and an empty outbox, so a failed or
repeated attempt cannot discard local work. A device that fails verification
should discard the downloaded bytes and retry, or fall back to replaying the
ordered log from zero if the workspace still retains it.

**Lost bucket contents.** Chunked operations become unresolvable and the client
records them as conflicts rather than applying partial state. Inline history is
unaffected. There is no server-side rebuild path: the authoritative copy of a
workspace is the local SQLite database on each connected device.

## Deletion

Deleting a workspace requires deleting the Durable Object state, its D1
membership and device rows, and the `workspaces/<workspaceId>/chunks/` R2
prefix. No automated account-deletion or cloud-purge flow exists yet; it
remains open on the [master tracker](cloud-sync-master.md).
