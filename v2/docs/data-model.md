# Data model

## Canonical tables

### `workspace_nodes`

One tree for notes and folders. Stable string IDs cross desktop, browser, import, and eventual sync boundaries. Sibling `rank` values use gaps; rare compaction runs transactionally.

### `documents`

One row per note.

- `document_json`: canonical structured editor document.
- `markdown`: transactional portable projection.
- `revision`: optimistic concurrency token.
- `word_count`: cached metadata projection.

Structured JSON avoids parsing Markdown during navigation. Markdown supports export, search, and Git history.

## Derived tables

### `documents_fts`

FTS5 projection over title and Markdown. Updated in the same transaction as canonical writes. Rebuildable from canonical tables.

### `history_cache`

Note-specific version headers for instant right-sidebar rendering. Rebuildable atomically from the selected history backend. Historical Markdown remains in that backend and loads only when the user opens a version.

## Operational tables

### `schema_migrations`

Ordered migration version, immutable name, SHA-256 checksum, and application time. Startup rejects altered applied migrations and databases created by a newer application. Migration execution remains adapter-owned so a future SQLite-WASM implementation can apply the same SQL files inside its worker.

### `history_outbox`

Durable leased queue containing committed document revisions not yet materialized by the selected history backend. Successful processing records history metadata and removes the queue row. Failed or abandoned leases remain retryable.

### `app_state`

Small JSON values such as last active note and settings. Secrets never belong here.

## Transaction rules

- Create note: node, document, FTS row, history outbox row.
- Save note: revision check, document update, node timestamp, FTS replacement, history outbox row.
- Claim history: short lease update only; materialization runs after the transaction releases.
- Complete history: cached header insert and matching leased outbox deletion.
- Failed history: release lease and persist bounded diagnostic text for retry.
- Move/reorder: node parent and rank only.
- Delete: soft-delete node. Purge is a separate explicit operation.
- Restore: clear deletion marker and assign parent/rank.

Any partial failure rolls back the complete logical operation.
