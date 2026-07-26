# Note properties (custom metadata fields)

Status: not started.

The untyped storage shape below is an earlier baseline. The accepted parity target in
[`editor-parity.md`](editor-parity.md) requires the implementation revision to use
versioned typed values and templates matching v1 before this feature starts.

## Goal

Let a user attach arbitrary key/value metadata to a note — a due date, a status, a rating, a URL, whatever they define — shown in the existing metadata panel (`app/src/shell/metadata-panel.tsx`) alongside built-in fields, without the schema needing to know property names in advance.

## Non-goals

- No per-workspace property "schema"/type system (e.g. defining a `status` property with an enum of allowed values shared across notes) in v1 of this feature. Start with untyped key/string-value pairs per note; a shared-schema layer is a legitimate follow-up once real usage patterns are known, not a prerequisite.
- No properties-as-database-view (e.g. a table view grouping/filtering notes by property, Notion-style). That's a much larger feature; this spec is storage + display only.
- No computed/formula properties.

## Data model

New table, migration (next free number):

```sql
CREATE TABLE IF NOT EXISTS note_properties (
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (note_id, key)
) STRICT;

CREATE INDEX IF NOT EXISTS note_properties_note ON note_properties(note_id, position);
```

Modeled after `document_references` (migration `0003_relationships.sql`) — a plain relational table keyed by `note_id`, not a JSON blob column on `workspace_nodes`. This keeps properties queryable (future: "find notes where `status` = `done`") and keeps `workspace_nodes` itself unchanged, matching how tags/people/mentions were kept out of the node row too. `value` is always `TEXT`; typed values (numbers, dates, booleans) are a rendering-layer interpretation of the string, not a storage-layer concern, consistent with the "no non-goal type system" decision above. `position` preserves user-chosen display order since properties are user-authored and order carries meaning (unlike, say, tags).

Do not reuse `WorkspaceSettings`'s `Record<string, unknown>` extension-data pattern for this — that pattern exists for one versioned document (settings), not for per-note repeating data.

## Domain and operations

`crates/skriuw-domain`: add operations mirroring the tag/person CRUD shape already in `WorkspaceOperation` (`SetNoteProperty`, `RemoveNoteProperty`, `ReorderNoteProperties`):

```rust
SetNoteProperty {
    note_id: String,
    key: String,
    value: String,
    position: i64,
    at: i64,
},
RemoveNoteProperty {
    note_id: String,
    key: String,
    at: i64,
},
ReorderNoteProperties {
    note_id: String,
    ordered_keys: Vec<String>,
    at: i64,
},
```

Validation: `note_id` must reference an existing, non-trashed note (folders don't get properties — decide explicitly if that's wanted; this spec assumes notes only, matching "note properties" as named in the backlog). `key` non-empty, reasonable max length (match whatever bound tag/person names use).

## Storage

SQL branch in `crates/skriuw-sqlite` following the tag/person pattern exactly — `SetNoteProperty` is an upsert (`INSERT ... ON CONFLICT (note_id, key) DO UPDATE`), `RemoveNoteProperty` a delete, `ReorderNoteProperties` a batch position update in one transaction. Include `note_properties` rows in whatever query hydrates a full `WorkspaceSnapshot` on bootstrap (see `docs/data-model.md`'s transaction rules table — add a row for this).

## Contracts and renderer

`app/src/contracts/workspace.ts`: add

```ts
export type NoteProperty = {
  noteId: string;
  key: string;
  value: string;
  position: number;
};
```

to `WorkspaceSnapshot`, regenerated via `./scripts/generate.sh`.

`app/src/store/types.ts`/`store.ts`: index properties by `noteId` the same way other per-note derived data is indexed, so the metadata panel subscribes only to the active note's properties (per `AGENTS.md`'s "split subscriptions by dependency" rule) — not the whole `note_properties` table.

`app/src/shell/metadata-panel.tsx`: render a properties section — list of key/value rows, an "add property" affordance, inline rename/edit/delete, drag-or-button reorder. Keep it visually consistent with however tags/people are already shown in this panel; don't introduce a new visual pattern for what is conceptually similar data.

## Archive and portability

Properties are workspace content — include `note_properties` in portable archive export/import (ADR-0007/0019 fixture discipline applies, same as pinned notes and images). Missing `note_properties` on import of an older archive defaults to zero properties, not an error.

## Acceptance criteria

- Adding, renaming, editing, reordering, and removing a property round-trips through operation → SQLite → renderer store → metadata panel correctly and is visible immediately (synchronous local update, per the runtime contract in `ARCHITECTURE.md` — no waiting on acknowledgement to see it locally).
- Properties persist across restart and archive export/import.
- Trashing/purging a note removes its properties (`ON DELETE CASCADE` covers purge; verify trash alone — a soft delete — correctly keeps properties until purge, consistent with how document content survives trash).
- The metadata panel subscribes only to the active note's properties; editing properties on the active note does not re-render the sidebar or unrelated panel sections.
- Archive fixtures include a workspace with note properties and one without, proving both import cleanly.
