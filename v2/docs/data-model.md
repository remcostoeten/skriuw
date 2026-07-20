# Data model

## Canonical tables

### `workspace_nodes`

One tree for notes and folders. Stable string IDs cross desktop, browser, import, and eventual sync boundaries. Callers request first, last, before, or after placement. Storage allocates gapped sibling `rank` values and transactionally compacts only the active destination sibling set when no midpoint remains.

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
- Create, move, and restore placement: allocate a midpoint rank when possible; otherwise compact the active destination sibling set and acknowledge every changed rank.
- Trash subtree: set the selected root's deletion marker; descendants inherit unavailability without changing their timestamps.
- Restore subtree: clear the root deletion marker and assign an active parent/rank; independently trashed descendants stay trashed.
- Purge subtree: enforce the retention cutoff, delete FTS rows, then delete canonical nodes so document, history-cache, and history-outbox rows cascade in the same transaction.

Any partial failure rolls back the complete logical operation.

## Portable archive

The versioned archive contains `workspace_nodes`, `documents`, settings, and active-note state. Import validates the complete domain graph before opening a transaction, replaces canonical state atomically, rebuilds FTS, and enqueues one history baseline per document. It never transports migration rows, FTS internals, cache rows, or queue leases.

Deletion timestamps are direct trash markers. Active-tree projections derive effective unavailability from the complete ancestor chain. Search, active-note state, history reads, history claims, and commands use the same inherited rule. Reversible trash keeps rebuildable projections intact; permanent purge removes them.

## Native backup

Raw desktop backup uses the SQLite Online Backup API and publishes a normalized single-file database only after SQLite, foreign-key, migration-checksum, and domain validation. Restore creates another validated database path; it never overwrites the open workspace.
