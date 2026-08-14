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

### `note_properties`

Ordered typed metadata fields owned by notes. Identity, name, and position remain relational; the versioned kind-specific value and bounded select options are stored as validated JSON. Person values reference canonical workspace people by ID at the domain and operation boundaries. Soft trash preserves properties and permanent purge cascades them with the note.

### `note_property_templates` and `note_property_template_fields`

Ordered reusable workspace templates. Template fields use the same versioned value and option contract as note properties, but do not own note IDs. Templates are canonical workspace content and remain independent from renderer settings.

### `workspace_tasks`

Canonical task records: title, status, priority, due date, description, tag and assignee ID collections, and an optional source link to the checklist item a task was promoted from. The link is paired: `source_note_id` and `source_block_id` are set or cleared together, and a partial unique index keeps one task per source block.

The table deliberately carries no foreign key to `workspace_nodes`. A cascade would destroy the task with its note and an automatic `SET NULL` would break the paired link, so purge detaches the affected tasks explicitly and stamps `detached_at`. A task always outlives its source.

Nothing promotes a checklist item implicitly. An ordinary `check_item` without both `taskId` and `blockId` attributes is document-only content and produces no record.

## Derived tables

### `documents_fts`

FTS5 projection over title and Markdown. Updated in the same transaction as canonical writes. Rebuildable from canonical tables.

### `history_cache`

Note-specific version headers for instant right-sidebar rendering. Rebuildable atomically from the selected history backend. Historical Markdown remains in that backend and loads only when the user opens a version.

## Operational tables

### `schema_migrations`

Ordered migration version, immutable name, SHA-256 checksum, and application time. Startup rejects altered applied migrations and databases created by a newer application. Migration execution remains adapter-owned so a future SQLite-WASM implementation can apply the same SQL files inside its worker.

### `history_outbox`

Durable leased queue containing committed document revisions not yet materialized by the selected history backend. Successful processing records history metadata and removes the queue row. Failed or abandoned leases remain retryable. `last_error` stores only the bounded deterministic display of a categorized local history diagnostic, is cleared on the next claim, and is excluded from snapshots and portable archives.

### `sync_connection`, `sync_outbox`, and `sync_blocked_operations`

Optional connected-mode operational state. The singleton connection owns the
stable device identity, observed server sequence, and next client sequence.
Replicated local operations enter `sync_outbox` in the same transaction as
canonical content and history projections. Lease/retry state makes upload
crash-safe and preserves operation IDs across acknowledgement loss. Oversized
or protocol-unsupported local operations remain durable and visible in
`sync_blocked_operations` without failing the local edit or consuming a client
sequence. All three tables are excluded from portable archives. See the
[local sync outbox contract](specs/local-sync-outbox.md).

### `app_state`

Small JSON values: the last active note and one versioned `WorkspaceSettings` document under the `settings` key. Missing fields deserialize to defaults, unknown fields are preserved as extension data, and unsupported future versions are rejected explicitly. Secrets never belong here.

## Transaction rules

- Create note: node, document, FTS row, history outbox row.
- Save note: revision check, document update, node timestamp, FTS replacement, history outbox row.
- Set or remove property: validate the typed value and references, preserve contiguous order, write the field, and update the note timestamp.
- Reorder properties or templates: require the exact stored ID set and update every position in one transaction.
- Set template: replace its complete validated ordered field set atomically.
- Consecutive queued saves: at most 64 request groups share one outer transaction; each group uses a savepoint so its conflict or failure does not roll back successful neighbors, and completions resolve only after the outer commit.
- Connected local operation: canonical mutation, projections, history enqueue,
  sync enqueue or blocked record, and client-sequence advance share one
  transaction/savepoint.
- Claim history: short lease update only; materialization runs after the transaction releases.
- Complete history: cached header insert and matching leased outbox deletion.
- Failed history: release lease and persist bounded diagnostic text for retry.
- Create, move, and restore placement: allocate a midpoint rank when possible; otherwise compact the active destination sibling set and acknowledge every changed rank.
- Trash subtree: set the selected root's deletion marker; descendants inherit unavailability without changing their timestamps.
- Restore subtree: clear the root deletion marker and assign an active parent/rank; independently trashed descendants stay trashed.
- Purge subtree: enforce the retention cutoff, detach the tasks sourced from the subtree, delete FTS rows, then delete canonical nodes so document, history-cache, and history-outbox rows cascade in the same transaction.
- Promote checklist item: write the source document and insert the task in one operation, then re-prove the link against the stored document. Neither half can land alone.
- Save document: after the document lands, reconcile the tasks linked to that note. The document owns the checklist item, so its text and checkbox win, and a link the document no longer carries detaches its task instead of deleting it.
- Update, detach, or delete task: apply the record change and the optional source-document rewrite in the same transaction; the source link itself only moves through promotion or detachment.

Any partial failure rolls back the complete logical operation. In a grouped save transaction, the logical operation remains the original submitted request rather than the complete runtime batch.

## Portable archive

The versioned archive contains `workspace_nodes`, `documents`, settings, active-note state, typed note properties, property templates, and tasks. Import validates the complete domain graph before opening a transaction, replaces canonical state atomically, rebuilds FTS, and enqueues one history baseline per document. Archive versions 1 and 2 default missing property collections to empty; version 3 is the first format that exports them. Versions 1 to 3 default tasks to empty; version 4 is the first format that exports them, and its validation re-proves every task source link against the documents in the same archive. It never transports migration rows, FTS internals, cache rows, or queue leases.

Deletion timestamps are direct trash markers. Active-tree projections derive effective unavailability from the complete ancestor chain. Search, active-note state, history reads, history claims, and commands use the same inherited rule. Reversible trash keeps rebuildable projections intact; permanent purge removes them.

## Native backup

Raw desktop backup uses the SQLite Online Backup API and publishes a normalized single-file database only after SQLite, foreign-key, migration-checksum, and domain validation. Scheduled artifacts are indexed by immutable versioned manifest generations containing relative names, timestamps, sizes, file checksums, schema versions, migration-ledger fingerprints, verification state, and retryable pending deletions. Count- and age-based pruning requires an exact manifest record, regular file, byte size, and checksum match. Restore creates another validated database path; it never overwrites the open workspace.
