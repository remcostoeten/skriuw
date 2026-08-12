# ADR-0011: Graceful storage runtime shutdown

- Status: accepted
- Date: 2026-07-20

## Context

`WorkspaceRuntime` spawned a detached storage worker with no lifecycle contract. Nothing rejected new work during teardown, nothing guaranteed accepted requests were drained, dropping the last handle leaked a running thread, and a worker panic was indistinguishable from ordinary unavailability. Desktop shells need a deterministic quiesce point before closing or swapping a database.

## Decision

Every `WorkspaceRuntime` clone shares one reference-counted lifecycle state containing the single request sender and the worker join handle.

`shutdown()` first revokes the shared sender under a lock. From that point every new submission fails with `RuntimeError::Unavailable` on any clone. Requests accepted before revocation stay queued; the worker drains them in FIFO order, sends each pending completion result, and exits when the channel closes. Shutdown then joins the worker under a lifecycle lock, records the outcome, and replays it, so concurrent and repeated shutdown calls are safe, block until the drain finishes, and join the thread at most once.

Dropping the final runtime handle performs the same revoke-and-join, so no detached worker outlives the last handle. A worker panic or failed join surfaces as `RuntimeError::WorkerFailure` from every subsequent `shutdown()`, while completions whose responses were lost resolve as `RuntimeError::Unavailable`.

## Consequences

- Shells gain a deterministic quiesce point: after `shutdown()` returns, no storage work is running or queued.
- Serialized FIFO execution and lock behavior of the storage adapter are unchanged.
- Submission takes a short shared-state lock instead of using a per-clone channel sender.
- Shutdown and final drop block on outstanding queued work, so callers must not invoke them from latency-sensitive threads.
- Worker failure is explicit and repeatable rather than hidden behind channel disconnection.
