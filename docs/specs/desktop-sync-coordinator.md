# Desktop background sync coordinator

Status: implemented; production sync runs against the deployed
[authentication boundary](cloud-sync-authentication.md) after an explicit
Account-settings connection.

`crates/skriuw-sync` owns the background lifecycle between the durable
[native sync queue](local-sync-outbox.md) and the workspace sync service.
The same cycle runs inside the browser storage worker
([ADR-0028](../adr/0028-browser-worker-owned-sync.md)); the differences below
are scheduling, not protocol. Scope and completion tracking live in the
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

Every trigger sets one coalesced wake flag consumed by the single loop, so
trigger bursts cannot create duplicate concurrent push or pull loops or
unbounded tasks. Wakes come from:

- startup with an active connection, and a session refresh;
- a relevant local commit;
- window focus, and the renderer's blur and `visibilitychange: hidden`
  transitions, which first flush the pending editor save (250 ms trailing
  debounce) and then request a refresh so the last edit leaves the device
  before it goes idle;
- the wake channel: the shell's WebSocket listener reports each server
  `workspaceChanged` notification and reports its own channel state through
  `set_wake_channel_connected(bool)`;
- online/offline: the renderer forwards the browser `online`/`offline` events
  through `set_workspace_sync_online(online)`. Offline is a scheduling hint,
  not a gate — the coordinator still probes every 15 s while flagged offline,
  any wake clears the flag, and a successful transport call flips it online;
- manual refresh and retry from the account surface;
- the fallback poll.

The poll interval adapts to what the renderer reports through
`set_workspace_sync_visibility(visible, focused)` and to the wake channel:

| Channel | Window | Interval |
| --- | --- | --- |
| up | any | 60 s |
| down | visible and focused | 15 s |
| down | visible, unfocused | 60 s |
| down | hidden | 5 min |

`request_refresh` (user intent, focus, wake) also clears the durable
`next_attempt_at` of every unclaimed outbox row (`reset_sync_retry_times`) and
resets the backoff, so a user-initiated retry is never deferred by a delay
recorded before the user acted.

## Failure classification and retry

`TransportError` is the stable classification; coordinator behavior depends
only on it:

| Class | Behavior | Status |
| --- | --- | --- |
| `Transient`, `Server`, `RateLimited` | release lease, bounded exponential backoff with deterministic jitter (1 s base, 60 s cap); server retry hints may extend but never shorten the delay | `retrying { nextAttemptAt }` |
| `AuthenticationRequired` | release lease at once; mark the session invalid so no further cycle is scheduled; see session expiry below | `authenticationRequired` |
| `AuthorizationDenied`, `Validation`, `Conflict`, `UnsupportedProtocol` | release lease with a long durable retry time (10 min); after three consecutive identical `Validation` rejections of the same claimed batch the batch is parked as `cloud_rejected` and the queue moves on | `blocked { reason, detail }` |
| `LogTruncated` (HTTP 410) | pull below the server's compaction floor; recover by rehydration (below) | `rehydrating`, or `blocked { log_truncated }` while the outbox is non-empty |
| `Cancelled` | release lease for immediate retry | `pending` |

A locally missing asset blob is not a `TransportError`: before the push, the
cycle moves the affected operations into `sync_blocked_operations` with reason
`asset_content_missing` and keeps pushing everything else (see
[content-addressed chunk transport v1](sync-content-chunks-v1.md)).
A batch is renumbered into the blocked table only on its first attempt; a
batch any of whose rows has been attempted before may be server-visible and is
released with a retry instead, so a lost acknowledgement resolves through the
server's idempotent accept on the next push.

Retry times are durable (`sync_outbox.next_attempt_at`), so restarts respect
rate limits. Push retries reuse the same operation ID and client sequence;
server idempotency makes acknowledgement loss safe, and a lost acknowledgement
also resolves through the pull local-echo path without reapplying content. A
rejected acknowledgement is retried; after three consecutive rejections the
cycle reports `blocked` with detail, skips the acknowledgement for that cycle,
and still pulls.

A transient push failure does not skip the pull phase: the cycle still pulls,
and the outcome reports the push retry, so a device that cannot upload keeps
receiving.

Pull responses are validated before use. A malformed response, a sequence gap
the server did not report as truncation, an echo that matches no outbound
row, or a protocol-invalid operation is a deterministic rejection and becomes
`blocked { rejected_pull, detail }` with the 10-minute retry; it never
advances the cursor. A busy or locked local database is a short transient
retry, never a block. Each pull page applies in sub-batches of 32 operations
so a long page never holds one transaction open across the whole page; every
operation's complete outcome (canonical change, received record, history row,
cursor advance) stays inside one transaction. Remote operations apply through
the domain/storage validation path under
[sync convergence v1](sync-convergence-v1.md); an operation that does not
apply becomes a `superseded` received record and later operations continue.

## Timeouts and page size

The desktop transport sets no global request timeout. It uses a 5 s connect
timeout and a per-request timeout of `10 s + 1 s per 64 KiB of request body`,
capped at 180 s (`skriuw_sync::http::request_timeout_ms`); the browser bridge
uses the same helper for its XHR deadline. The server builds pull pages under
a 3 MiB serialized budget (at least one operation); when a response exceeds
what the client can buffer, the client halves `pull_batch_limit` for the next
attempt (minimum 1) and restores it after a successful page.

## Session expiry

The bearer token lives behind one shared lock read by the transport and the
wake listener, so a refreshed token is used by both on their next call. When a
cycle settles `AuthenticationRequired`, the coordinator marks the session
invalid and stops polling; the shell stops the wake listener, clears the
vault token, and emits `sync-session-expired`. The renderer forgets its
session and shows "Sign in" whenever status is `authenticationRequired`,
regardless of any cached user. The listener also exits on a 401/403
handshake. `connect_workspace_sync(token, baseUrl)` receives the cloud base URL
from the renderer and validates it (`https` with a trusted suffix, or
`http://localhost` in debug builds).

## Lifecycle

- Cancellation: shutdown and interrupt flags are checked before and inside
  every transport call. Shutdown joins the worker without losing durable queue
  state.
- Logout pauses sync, interrupts the in-flight call, and preserves the local
  database, pending outbox, and blocked records; session refresh resumes the
  same sequence.
- Work per cycle is bounded (push batches and pull pages); remaining work
  reschedules immediately as `pending`.
- A settled `upToDate` resets the backoff.

## Checkpoints, rehydration, and retention

The coordinator drives the [content-addressed checkpoint
transport](sync-content-chunks-v1.md) in three places, all off the interaction
path and all deterministic under the fake clock:

- **Hydration on first connect.** A cycle whose durable cursor is zero, whose
  next client sequence is one, and whose received-operation, outbox, and
  unresolved blocked tables are empty downloads the latest published
  checkpoint, verifies it byte-for-byte through
  `WorkspaceCheckpoint::verify_content`, hydrates through
  `WorkspaceSyncQueue::hydrate_from_checkpoint` inside one immediate
  transaction that re-checks the same precondition (claimed outbox rows
  included), and then pulls only the ordered tail. Any other state replays the
  log. A workspace without a checkpoint replays from zero. A checkpoint that
  fails verification, names another workspace, or has lost content becomes
  `blocked { rejected_checkpoint }` rather than silently falling back.
- **Rehydration after log truncation.** When pull answers `log_truncated`,
  the push phase has already run, so the outbox is empty unless rows were
  parked. With a non-empty outbox the cycle reports `blocked { log_truncated,
  detail }` and retries; with an empty outbox it reports `rehydrating`
  ("Rebuilding this device from the cloud…"), fetches and verifies the latest
  checkpoint at sequence `C`, calls `rehydrate_from_checkpoint(archive, C)`,
  and continues pulling from `C`. A workspace whose latest checkpoint is
  missing is `blocked { log_truncated_without_checkpoint }`. The port
  contract for what rehydration keeps and clears is in
  [sync convergence v1 §5](sync-convergence-v1.md#hydration-and-rehydration).
- **Publication after convergence.** After a cycle settles `upToDate`, the
  coordinator publishes a checkpoint when the ordered log has advanced at
  least `CheckpointPublicationConfig::publish_interval_operations` (default
  64, one full push batch) past the latest checkpoint the server holds, or
  immediately when the workspace has none. The decision compares durable
  server sequences only, and the server's latest checkpoint record is the
  single source of truth, fetched once per process and after every restart.
  The exported archive is verified to still match the converged cursor
  (empty outbox re-check after the export transaction) before its chunks are
  uploaded and the record is published, so a checkpoint never smuggles
  unpushed local operations. Publication failures surface through the same
  classification without disturbing later push/pull cycles.

A converged cycle also acknowledges the device cursor
(`POST …/acknowledge`), which is what lets server-side compaction retire log
entries below the oldest retained checkpoint and every active cursor.

## Change reporting

Each cycle outcome carries a `RemoteChangeSet { noteIds, structureChanged,
full }` accumulated from applied and superseded outcomes: document operations
contribute note IDs, any other applied operation sets `structureChanged`, and
hydration, rehydration, or more than 256 changed notes set `full`. The shell
emits it as `sync-workspace-changed`; the browser driver receives the same
object in the cycle report. The renderer reconciles narrowly
(`read_workspace_documents` for the listed notes) unless `full` or
`structureChanged` demands a snapshot; the editor merges an incoming body for
the open note without an undo entry, deferring while an IME composition is
active.

## Status projection

The runtime exposes one narrow projection: `localOnly`, `connecting`,
`rehydrating`, `upToDate`, `pending`, `offline`, `authenticationRequired`,
`retrying { nextAttemptAt }`, and `blocked { reason, detail }` (detail at most
1,024 characters). There is no conflict state. A cycle settles `upToDate` only
when `has_pending_sync_operations()` is false; that check counts unclaimed
outbox rows regardless of `next_attempt_at` and unresolved blocked rows, so a
device with parked or delayed work shows `retrying { min(nextAttemptAt) }` or
`blocked` rather than a false `upToDate`. The UI reads the projection and may
request connect, disconnect, retry, or refresh; it never owns retry, backoff,
or cursor logic.

The desktop shell registers `workspace_sync_status`, `connect_workspace_sync`,
`disconnect_workspace_sync`, `retry_workspace_sync`,
`refresh_workspace_sync`, `set_workspace_sync_online`,
`set_workspace_sync_visibility`, and `read_workspace_documents` commands plus
commit/focus/shutdown triggers, and emits `sync-workspace-changed` and
`sync-session-expired`.

## Browser driver

`app/src/bridge/browser-sync.ts` schedules the same cycle inside the storage
worker. It classifies driver failures: a transient failure backs off from
1 s to 60 s and keeps the session active; a terminal or session-lost failure
resets the resume state and re-establishes the session from the persisted
token on the next wake. Its status overlays `retrying { nextAttemptAt }` after
two consecutive failures and `blocked { driver_failure }` after five failed
reconnects. The request timeout starts when the worker reports that the
request began, so a save queued behind a long cycle never terminates the
worker, and a local commit issues `sync_interrupt` so the cycle yields before
apply and reschedules afterwards. The driver applies the same trigger set,
poll table, and offline hint as the desktop coordinator.

## Unresolved connect policy

Connecting an existing local workspace to a cloud workspace is a destructive
identity decision and requires the separately specified explicit upload/connect
flow together with account UI. Nothing here attaches a workspace implicitly;
`connect_sync` continues to reject rebinding to a different identity, and an
archive import into a linked workspace stays refused.

## Verification

`crates/skriuw-sync` carries a deterministic fake clock, fake workspace
service, and fault-injecting transport (ack loss, duplicates, gaps, malformed
pages, oversized pages, rate limits, session expiry, disconnects, log
truncation). Integration tests prove the scenarios in
[sync convergence v1 §6](sync-convergence-v1.md#6-executable-scenario-catalogue)
end to end across two real SQLite databases, including offline edit on both
devices with reconnection in either order, restart, reconnect, three-device
ack-before-echo, parked write then remote write then retry, sign-out
mid-push, token expiry mid-pull, and rehydration after truncation with own
writes reappearing. Driver tests prove single-loop coalescing, adaptive
polling, offline probing, prompt shutdown cancellation, logout preservation,
zero transport calls in local-only mode while interaction paths run, and local
commits completing while the transport is blocked indefinitely. Propagation
latency is measured under `docs/benchmarks/`.
