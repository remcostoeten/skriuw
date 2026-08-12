# ADR-0012: Lossless save batching

- Status: accepted
- Date: 2026-07-20

## Context

Every submitted document save currently opens and commits an independent SQLite transaction. Rapid editor persistence can therefore create avoidable queue pressure and durable-commit overhead. Debouncing or keeping only the newest document would lose revision acknowledgements, intermediate Markdown history, and precise conflict behavior.

## Decision

The runtime batches at most 64 consecutive queued requests whose operations are exclusively `SaveDocument`. It never waits to form a batch. Bootstrap, search, tree, settings, mixed-operation, and other requests are FIFO barriers; saves on opposite sides of a barrier are processed separately.

The storage port accepts ordered operation groups and returns one result per group. Its default adapter behavior applies groups sequentially. SQLite overrides the capability with one outer transaction and one savepoint per request group. A successful group remains pending inside the outer transaction. A failed group rolls back only to its savepoint, records its original validation, conflict, or storage error, and does not erase successful neighboring groups. The outer commit happens before any completion is resolved. If the outer transaction cannot commit, no success is acknowledged.

Every submitted save still executes in FIFO order, advances its expected revision independently, updates FTS, and appends its own history-outbox row. Every caller receives its own `OperationAck` or precise operation error. No editor state, debounce timer, revision choice, or optimistic update moves into the runtime.

Shutdown revokes submissions as already defined, then drains bounded save batches before joining the worker. The maximum group count bounds transaction size and completion delay without placing timing work in the renderer path.

## Consequences

- Bursts reduce SQLite commit count without dropping saves, history, conflicts, or acknowledgements.
- Non-SQLite adapters remain correct through sequential default behavior and may optimize later.
- Successful saves in one outer transaction become durable together; their completions are sent only after that commit.
- A process failure before the outer commit produces no false success acknowledgement.
- Batching remains persistence work outside synchronous editing and navigation feedback.
