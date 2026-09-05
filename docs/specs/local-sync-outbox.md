# Local sync connection and transactional outbox

Status: implemented native storage foundation; the same migrations run in
the browser worker.

This specification defines the SQLite boundary between the exhaustive
[workspace operation sync policy](workspace-operation-sync-policy-v1.md) and
the [sync coordinator](desktop-sync-coordinator.md): the connection record,
the transactional outbox, blocked rows, received-operation records, and the
history provenance the inbound path writes. Merge decisions are defined in
[sync convergence v1](sync-convergence-v1.md).

## Connection lifecycle

`sync_connection` is a singleton record containing the remote workspace ID,
stable device ID, connection timestamp, latest observed server sequence, next
client sequence, and `rehydrated_through`, the checkpoint sequence this device
last rebuilt from (`0` when it never did). A fresh database has no record and
behaves exactly as a local-only workspace.

Disconnect marks the record inactive instead of deleting it. This stops claims
and new enqueueing while preserving the device identity, monotonic sequence,
pending rows, blocked rows, and locally committed content. Reconnecting the
same workspace/device resumes the queue. Rebinding an existing database to a
different sync identity is rejected; the later explicit upload/connection flow
must define that destructive transition.

Portable archives exclude the connection and every queue table. Replacing a
workspace from a portable archive is rejected while connected because archive
replacement does not consist of replayable `WorkspaceOperation` values. After
disconnect, replacement clears the old connection, pending queue, and blocked
records atomically with canonical replacement so work from the prior local
workspace cannot later upload; the connection state is re-read inside that
replacement transaction. Native verified database backup retains the
connection, pending queue, blocked rows, received records, heads, tombstones,
and history provenance as part of crash/recovery state.

Rehydration after server log truncation is the one canonical replacement a
connected workspace accepts. It runs inside one immediate transaction with
`preserve_sync_connection`, requires an empty outbox, keeps
`sync_blocked_operations` and `sync_tombstones`, clears
`sync_received_operations` and `sync_document_heads`, carries `history_outbox`
rows for notes in the checkpoint, and sets the cursor and
`rehydrated_through` to the checkpoint sequence. First-connect hydration
requires, inside its transaction, a zero cursor, next client sequence one, no
received rows, an empty outbox (claimed rows included), and no unresolved
blocked rows.

## Transactional enqueue

When an active connection exists, `SqliteWorkspace::apply_operations` performs
the canonical mutation and sync classification inside one SQLite transaction:

1. replicated inline operations receive a stable UUID operation ID, the next
   monotonically increasing client sequence, and the connection's observed
   server sequence;
2. device-local operations commit locally without a sync row;
3. protocol-unsupported or oversized operations commit locally and create an
   unresolved `sync_blocked_operations` record;
4. only successfully enqueued operations consume client sequences.

Grouped saves use the existing per-request savepoint. A failed group rolls back
its canonical changes, history rows, sync rows, blocked rows, and sequence
advance without affecting successful neighboring groups. Cloud availability is
not consulted anywhere in this transaction or on an interaction path.

## Lease, retry, and acknowledgement

The `WorkspaceSyncQueue` storage port exposes bounded claim, acknowledge,
release, and blocked-operation reads. Claims return a validated
`SyncPushRequest` in client-sequence order and never skip an unavailable earlier
row. A lease can be reclaimed after expiry with the same operation ID and
client sequence, so server idempotency makes acknowledgement loss safe.

Acknowledgement and retry release must match the complete currently leased
batch in order. Any mismatch rolls back the whole storage call. Acknowledgement
deletes the durable rows only after every operation ID and client sequence
matches the server response. Retry release retains them, records a bounded
diagnostic, and sets a durable next-attempt time.

`block_claimed_sync_operations` moves individual leased operations that cannot
push — an `attach_image` whose asset bytes are absent locally
(`asset_content_missing`), or a batch the server has rejected identically
three times (`cloud_rejected`) — into the blocked record. Because the server
requires contiguous per-device client sequences, the same transaction renumbers
the remaining pending rows contiguously from the queue head, advances
`next_client_sequence` to match, and releases the rest of the lease.
Renumbering is safe only while no row in the batch can be server-visible: if
any row in the claimed batch has been attempted before (`attempts > 1`), the
call releases the batch with a retry diagnostic instead of blocking, and the
lost-acknowledgement case resolves through the server's idempotent accept on
the next push. Blocking therefore happens only on a first attempt.

`has_pending_sync_operations()` counts unclaimed outbox rows regardless of
their retry time and unresolved blocked rows, so a device with parked work is
never reported up to date. `next_sync_attempt_at()` returns the earliest
durable retry time, and `reset_sync_retry_times(now)` clears the retry time of
every unclaimed row when the user or a focus/wake trigger asks for a refresh.

Requeueing a blocked document write (`retry_blocked_sync_operation`) compares
the parked body with the current canonical body; when they differ, the queue
enqueues a fresh `SaveDocument` of the canonical body and resolves the parked
row, so a stale body is never published. An unresolved blocked document write
counts as a pending local write for the document decision in
[sync convergence v1 §4](sync-convergence-v1.md#4-document-decision-and-history-provenance).

Disconnect pauses claims but never deletes pending work. Reconnect resumes the
same sequence. Local-only workspaces create no connection, outbox, blocked, or
network work.

## Inbound records and history provenance

Applying a pulled page runs through `apply_remote_operations` in sub-batches
of 32; every operation's canonical change, received record, history row,
tombstone, and cursor advance commit together. `sync_received_operations`
stores each envelope with outcome `applied`, `local_echo`, `no_op`, or
`superseded`; a superseded row carries a stable `reason` and a bounded
`detail`. `sync_document_heads` records, per note, the greatest server
sequence of an incorporated document write. An own-device operation with no
outbox row and no received row whose server sequence is above
`rehydrated_through` applies as an ordinary remote operation; any other own
echo without a matching outbound row is a deterministic rejection.

On the sync apply path `replace_references` tolerates a note mention whose
target does not exist yet: it skips that reference and records
`(note_id, target_id)` in `sync_dangling_references`. When a remote
`CreateNote` for that target applies, the same transaction re-runs reference
replacement for every note recorded against it and deletes those rows, so two
notes that mention each other seed correctly on a second device. Local
applies keep failing closed on a dangling reference.

Remote applies write `history_outbox` rows with provenance `remote`; a losing
document body is preserved through `preserve_document_version` with
provenance `superseded` and never enters `sync_outbox`. Coalescing applies
only to consecutive `local` rows inside the 120 s window.

## Schema ownership

Migration `0011_sync_outbox.sql` owns:

- `sync_connection`: optional active connection, device identity, observed
  cursor, and next client sequence;
- `sync_outbox`: immutable versioned envelopes plus lease/retry metadata;
- `sync_blocked_operations`: recovery-visible oversized, capability-blocked,
  missing-asset, or cloud-rejected local operations. Migration
  `0014_blocked_asset_content.sql` adds the `asset_content_missing` reason.

Migrations `0012_sync_inbound.sql` and `0013_sync_convergence.sql` own
`sync_received_operations` and `sync_tombstones`; `0021_sync_document_heads.sql`
owns `sync_document_heads`.

Migration `0023_automatic_convergence.sql` owns the automatic-convergence
shape:

- `history_outbox.provenance` (`local`, `remote`, `superseded`; unique on
  note, revision, and provenance);
- `sync_received_operations.outcome IN ('applied', 'local_echo', 'no_op',
  'superseded')` with `reason` and `detail`; former `conflict` rows migrate to
  `superseded` with their reason and message before `sync_document_conflicts`
  and `sync_conflicts` are dropped;
- the `cloud_rejected` blocked reason;
- `sync_connection.rehydrated_through`;
- `sync_dangling_references(note_id, target_id)`.

These are operational tables, not portable workspace content. SQLite remains
canonical for local content and the outbox is never a second document model.
The migration runner re-reads the ledger inside its immediate transaction and
skips migrations another connection already applied.
