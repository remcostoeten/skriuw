# ADR-0009: Subtree trash and permanent purge

- Status: accepted
- Date: 2026-07-20

## Context

A tree operation on a folder affects the user's view of its complete subtree. Marking only the selected row as deleted without defining inherited availability leaves descendants reachable through search, active-note state, history, or commands. Permanently deleting data also requires a scope and a retention boundary that cannot be confused with reversible trash.

## Decision

`TrashSubtree` marks only its selected root with `deleted_at`. Every descendant inherits unavailability while that ancestor remains trashed. Descendant timestamps are not rewritten, so restoring an ancestor does not restore descendants that were independently trashed before it.

The hydrated workspace retains canonical nodes and documents so the renderer can reconcile and restore a subtree without a database read. Active-tree selectors must exclude a node when it or any ancestor has `deleted_at`. Storage applies the same effective-availability rule to search, active-note state, history headers, history materialization, and every node or document command except restore and purge.

Trashing a subtree clears the active note when that note belongs to the subtree. FTS rows, history headers, and pending history rows remain durable but unavailable; restore makes them available again without rebuilding projections. Restoring requires an explicit active destination folder or the workspace root. A missing, purged, or still-trashed destination is rejected. Passing the workspace root is the explicit fallback when the original parent is unavailable.

`PurgeSubtree` permanently removes a directly trashed root and every descendant in one transaction. It deletes canonical nodes and documents, FTS rows, cached history headers, and pending history rows. The operation includes `trashed_before`, a retention cutoff supplied by policy code. Purge is rejected when the root is not directly trashed or when any direct trash marker inside the subtree is newer than the cutoff. Retention scheduling remains outside storage and may be added later.

Portable archives preserve direct deletion timestamps. Archive validation treats an active note below a trashed ancestor as unavailable.

## Consequences

- Nested trash and restore preserve independently trashed descendants.
- Availability checks require bounded ancestor or subtree traversal outside navigation paths.
- Renderer tree selectors must derive effective availability from the fully hydrated parent graph.
- Reversible trash retains search and history projections while preventing them from surfacing or processing.
- Purge is intentionally irreversible and has a deterministic, adapter-independent policy boundary.
