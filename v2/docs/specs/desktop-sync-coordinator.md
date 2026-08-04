# Desktop background sync coordinator

Status: implemented against a deterministic fake transport; production sync
stays disabled until the [authentication boundary](cloud-sync-authentication.md)
has production identity and membership configuration.

`crates/skriuw-sync` owns the background lifecycle between the durable
[native sync queue](local-sync-outbox.md) and the workspace sync service.
Scope and completion tracking live in the
[cloud sync master tracker](cloud-sync-master.md).

## Boundaries

- `SyncTransport` is the only network seam: bounded push and cursor pull over
  the generated v1 wire contracts. Implementations own credentials, request
  timeouts, and connection handling. There is no generic HTTP abstraction.
- The coordinator opens no SQLite transaction across a network call. It claims
  work, commits, calls the transport, and writes the result back through the
  `WorkspaceSyncQueue` port, so a crash at any point leaves resumable durable
  state protected by leases and server idempotency.
- The coordinator runs on one dedicated thread per workspace database with its
  own SQLite connection, exactly like the history drain. It never runs on, or
  is awaited by, typing, navigation, search, export, or recovery paths. A
  workspace without an active `sync_connection` schedules no polling and makes
  no transport calls.

## Triggers

Work starts after startup, a relevant local commit, reconnect, window focus,
manual refresh, and bounded polling (default 60 s while a connection exists).
Every trigger sets one coalesced wake flag consumed by the single loop, so
trigger bursts cannot create duplicate concurrent push or pull loops or
unbounded tasks.

## Failure classification and retry

`TransportError` is the stable classification; coordinator behavior depends
only on it:

| Class | Behavior | Status |
| --- | --- | --- |
| `Transient`, `Server`, `RateLimited` | release lease, bounded exponential backoff with deterministic jitter (default 1 s base, 5 min cap); server retry hints extend but never shorten the delay | `retrying` |
| `AuthenticationRequired` | release lease at once, pause until session refresh | `authenticationRequired` |
| `AuthorizationDenied`, `Validation`, `Conflict`, `UnsupportedProtocol` | release lease with a long durable retry time (default 10 min); these do not self-heal and stay visible | `blocked` with a stable reason code |
| `Cancelled` | release lease for immediate retry | `pending` |

Retry times are durable (`sync_outbox.next_attempt_at`), so restarts respect
rate limits. Push retries reuse the same operation ID and client sequence;
server idempotency makes acknowledgement loss safe, and a lost acknowledgement
also resolves through the pull local-echo path without reapplying content.

Pull responses are validated before use. A malformed response, a cursor gap, or
a page that fails to advance the durable cursor never advances it; the
coordinator backs off and re-pulls. Remote operations apply through the
existing domain/storage validation path; semantic conflicts become durable
`sync_conflicts` records while later operations continue to apply.

## Lifecycle

- Cancellation: shutdown and interrupt flags are checked before and inside
  every transport call. Shutdown joins the worker without losing durable queue
  state.
- Logout pauses sync, interrupts the in-flight call, and preserves the local
  database, pending outbox, and blocked records; session refresh resumes the
  same sequence.
- Offline transitions stop network attempts until reconnect; local commits
  continue and queue durably.
- Work per cycle is bounded (push batches and pull pages); remaining work
  reschedules immediately as `pending`.

## Status projection

The runtime exposes one narrow projection: `localOnly`, `connecting`,
`upToDate`, `pending`, `offline`, `authenticationRequired`,
`conflict { openConflicts }`, `retrying { nextAttemptAt }`, and
`blocked { reason }`. The UI reads it and may request connect, disconnect,
retry, or refresh; it never owns retry, backoff, or cursor logic.

The desktop shell registers `workspace_sync_status`, `connect_workspace_sync`,
`disconnect_workspace_sync`, `retry_workspace_sync`, and
`refresh_workspace_sync` commands plus commit/focus/shutdown triggers. Because
production authentication is not configured, the shell constructs the sync
runtime disabled: status reports `localOnly`, triggers are no-ops, and connect
and disconnect return one stable unavailable error.

## Unresolved connect policy

Connecting an existing local workspace to a cloud workspace is a destructive
identity decision and requires the separately specified explicit upload/connect
flow together with account UI. Nothing here attaches a workspace implicitly;
`connect_sync` continues to reject rebinding to a different identity.

## Verification

`crates/skriuw-sync` carries a deterministic fake clock, fake workspace
service, and fault-injecting transport (ack loss, duplicates, gaps, malformed
pages, rate limits, session expiry, disconnects). Integration tests prove the
scenarios above end to end across two real SQLite databases, including offline
edit, restart, reconnect, and exchange of supported non-conflicting
operations. Driver tests prove single-loop coalescing, prompt shutdown
cancellation, logout preservation, zero transport calls in local-only mode
while interaction paths run, and local commits completing while the transport
is blocked indefinitely. Convergence beyond non-conflicting operations is
governed by [sync convergence v1](sync-convergence-v1.md) and remains open.
