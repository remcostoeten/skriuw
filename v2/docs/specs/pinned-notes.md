# Pinned notes and folders

Status: not started. Post-v1.

## Goal

Let a user pin any note or folder so it appears in a fixed, always-visible group at the top of the sidebar, independent of tree position, trash state changes, and search filtering. Pinning is a lightweight bookmark, not a second classification system — there is deliberately no separate "favorites" concept. One boolean per node is the entire feature.

## Non-goals

- No pin ordering beyond most-recently-pinned-first (see Ordering). Do not build manual drag-to-reorder for the pinned group in v1 of this feature.
- No pin limit/quota.
- No pinning of tags, people, or search queries. Nodes only (notes and folders).
- No "smart" auto-pinning (e.g. pin-on-frequent-access). Explicit user action only.

## Data model

Add one column to `workspace_nodes`:

```sql
-- migrations/0005_pinned_nodes.sql
ALTER TABLE workspace_nodes ADD COLUMN pinned_at INTEGER;

CREATE INDEX IF NOT EXISTS workspace_nodes_pinned
    ON workspace_nodes(pinned_at) WHERE pinned_at IS NOT NULL;
```

Use a nullable timestamp (`pinned_at`), not a boolean, matching the existing `deleted_at` convention in this table. `NULL` means unpinned. A timestamp gives free, stable pin ordering (most-recently-pinned-first) without an extra rank column, and keeps the "when" auditable the same way trash already is.

`crates/skriuw-domain/src/lib.rs`: add `pinned_at: Option<i64>` to the `WorkspaceNode` struct, alongside `deleted_at`. Update every exhaustive match/constructor that builds a `WorkspaceNode` (the compiler will find them).

`app/src/contracts/workspace.ts`: add `pinnedAt: number | null` to `WorkspaceNode`, regenerate via `./scripts/generate.sh`, do not hand-edit the generated JSON Schema under `contracts/generated/`.

## Domain operation

Add to the `WorkspaceOperation` enum in `crates/skriuw-domain/src/lib.rs` (near `RenameNode`/`MoveNode`):

```rust
SetNodePinned {
    id: String,
    pinned: bool,
    at: i64,
},
```

Validation: the target node must exist and must not be trashed (`deleted_at.is_none()`) — pinning a trashed node is a validation error, matching how `RenameNode`/`MoveNode` already reject trashed targets. `RestoreSubtree` does not need to touch `pinned_at`; a note that was pinned before being trashed stays pinned after restore, since the column is untouched by trash/restore.

`PurgeSubtree` naturally drops the row, so no separate unpin-on-purge step is needed.

## Storage and runtime

Follow the existing pattern for every other operation: the storage port trait gets no new method (operations are applied generically through the existing operation-application path), only the SQL in `crates/skriuw-sqlite` needs a branch for `SetNodePinned` that does `UPDATE workspace_nodes SET pinned_at = ?, updated_at = ? WHERE id = ?`. Confirm against how `RenameNode` is implemented in `crates/skriuw-sqlite` before writing this — the same transaction/serialization guarantees apply (single serialized backend worker, atomic transaction, no I/O in domain).

## Archive and portability

`pinned_at` is workspace content, not local UI state — unlike sidebar expansion (`docs/adr`, N4), it must be included in portable archive export/import and travel with the workspace. Add it to the `WorkspaceArchive` JSON shape and to `docs/archive-fixtures.md`'s golden fixtures so the archive-compatibility tests catch any accidental omission. Bump the archive schema version per the existing versioning convention (see ADR-0007 and ADR-0019) since this is a new field older archives won't have; missing `pinned_at` on import must default to `null`, not fail validation.

## Renderer

- `app/src/store/tree.ts`: add a `pinnedNodeIds` (or similar) derived selector — nodes with non-null `pinnedAt`, filtered through the existing `unavailableNodeIds` exclusion (a trashed node is never shown pinned even if the column briefly disagrees), sorted by `pinnedAt` descending.
- `app/src/shell/sidebar.tsx`: render a "Pinned" section above the tree root, using the existing sidebar row component (`sidebar-row.tsx`) so styling, context menu, and keyboard behavior stay consistent — do not fork a new row component. The section is absent entirely when there are zero pinned nodes (no empty-state placeholder needed here; this is a convenience shelf, not a primary view).
- Context menu (existing Radix context menu used elsewhere in the sidebar, per `[[entity-page-parity]]`): add "Pin" / "Unpin" as a toggle item, wired to dispatch `SetNodePinned`.
- Command palette: add a "Pin/Unpin current note" action.
- Keyboard shortcut: pick an unused binding through the existing rebindable shortcut system (`app/src/shortcuts`); do not hardcode a key that bypasses user remapping.

## Ordering and interaction rules

- The pinned section is flat (no nesting), even for pinned folders — it shows the node's own title, not its subtree.
- Clicking a pinned folder navigates/expands it in the main tree, it does not expand inline in the pinned shelf.
- Pinning a node does not change its `rank` or position in the main tree; the main tree is unaffected and unchanged.
- Search reveal, expand-all, and multi-select in the main tree are unaffected — pinning is purely additive UI, never a replacement for tree presence.

## Acceptance criteria

- A pin/unpin round trip through the operation, SQLite, renderer store, archive export, and archive re-import preserves `pinnedAt` exactly.
- Trashing a pinned node removes it from the pinned shelf without touching `pinned_at`; restoring it makes it reappear pinned, in the same relative pinned order as before trashing.
- Purging a pinned node's subtree removes it from the pinned shelf permanently (row deleted).
- The pinned shelf survives desktop restart (it is ordinary workspace content hydrated on snapshot load, not separate persisted UI state).
- Archive fixtures cover: an archive with pinned nodes, an archive with no `pinnedAt` field at all (pre-feature archive) importing cleanly with all nodes unpinned.
- No pin/unpin action performs IPC, database, or Git work on the note navigation or editing path — it is a discrete operation dispatch like every other mutation, not a background job.
