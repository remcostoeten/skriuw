# ADR-0010: Backend-owned node ranking

- Status: accepted
- Date: 2026-07-20

## Context

Tree callers currently submit durable raw integer ranks. That leaks storage mechanics into UI code, permits accidental ties, and provides no recovery when repeated insertion consumes the gap between adjacent siblings. Compaction can also change ranks beyond the selected node, so a persistence acknowledgement must carry enough state to reconcile an optimistic renderer.

## Decision

Create, move, and restore operations submit a `NodePlacement` containing a destination parent and one of four positions: first, last, before an anchor, or after an anchor. Moving into a folder uses last placement for that folder. Before and after anchors must be active direct children of the requested parent. Ordering is always the durable tuple `(rank, id)`.

SQLite allocates ranks with a gap of 1024. Empty sibling sets start at 1024. First and last placement extend the outer gap when integer range permits. Before and after placement use an integer midpoint when at least one rank exists between adjacent siblings.

When no valid rank exists, storage compacts only the active destination sibling set in the same transaction. It inserts the requested node into the desired logical position and assigns consecutive multiples of 1024. Trashed siblings keep their stored ranks and do not participate until an explicit restore allocates a new active placement. Moving a node leaves gaps in its source sibling set and never compacts the source.

`OperationAck.rank_changes` contains the final parent and rank for the requested node and every sibling changed by compaction. Batched operations coalesce repeated changes by node ID and return deterministic ID order. Compaction does not change sibling `updated_at` values because it is a storage representation change rather than a user metadata edit.

## Consequences

- UI and future adapters share semantic placement requests instead of inventing durable ranks.
- Ordinary insertion updates one row; rare compaction updates one sibling set.
- Optimistic renderer state can reconcile every durable rank change from one acknowledgement.
- Stable ID tie-breaking repairs deterministic order even for imported legacy rank ties.
- Rank allocation remains persistence work outside navigation and interaction paint paths.
