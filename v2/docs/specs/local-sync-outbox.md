# Local sync connection and transactional outbox

Status: implemented native storage foundation.

This specification defines the native SQLite boundary between the exhaustive
[workspace operation sync policy](workspace-operation-sync-policy-v1.md) and a
future desktop sync coordinator. It does not add account UI, authentication,
network transport, remote operation application, or convergence behavior.

## Connection lifecycle

`sync_connection` is a singleton record containing the remote workspace ID,
stable device ID, connection timestamp, latest observed server sequence, and
next client sequence. A fresh database has no record and behaves exactly as a
local-only workspace.

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
workspace cannot later upload. Native verified database backup retains the
connection and pending queue as part of crash/recovery state.

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

Disconnect pauses claims but never deletes pending work. Reconnect resumes the
same sequence. Local-only workspaces create no connection, outbox, blocked, or
network work.

## Schema ownership

Migration `0011_sync_outbox.sql` owns:

- `sync_connection`: optional active connection, device identity, observed
  cursor, and next client sequence;
- `sync_outbox`: immutable versioned envelopes plus lease/retry metadata;
- `sync_blocked_operations`: recovery-visible oversized or capability-blocked
  local operations.

These are operational tables, not portable workspace content. SQLite remains
canonical for local content and the outbox is never a second document model.

## Deferred work

The next storage increment adds pull-cursor advancement, received-operation
idempotency, and durable conflict records while applying remote envelopes
through the existing domain/storage validation path. The desktop coordinator,
authentication, transport, polling, and UI remain separate later tasks.
