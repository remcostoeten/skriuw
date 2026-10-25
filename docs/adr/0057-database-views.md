# ADR-0057: Database views are a route over note properties

- Status: accepted
- Date: 2026-10-18
- Supersedes: the "database/table views over properties" non-goal in
  [note properties](../specs/note-properties.md)
- Superseded in part by: [ADR-0058](0058-database-board-blocks.md), which adds
  an embedded board block

## Context

Notes carry typed properties ([note properties](../specs/note-properties.md)),
but the only place to read or change them was one note's metadata panel. People
who track projects, reading lists, or pipelines in notes need to see and edit
those properties across many notes at once, as a table or as a board.

Three shapes were considered:

1. An embedded block in a note that renders a live table.
2. A new durable record type (a "database") with its own schema and rows.
3. A route that projects a folder's notes, or every note, from state the
   renderer already holds.

An embedded block puts a React grid inside ProseMirror, pulls cross-note
projections into the editing path, and needs a document schema change. A new
record type duplicates notes and properties as a second source of truth and
needs a migration, archive support, and sync rules before anything is visible.

## Decision

Database views are option 3: the `#/database` route (every note) and
`#/database/<folderId>` (one folder, optionally with its subfolders), rendered
by the workspace's `database` feature.

- **Rows are notes.** The renderer projects rows from `nodes`, `sourceNodes`,
  `metadata`, `documents`, and `propertiesByNoteId` with a memoized selector that
  reuses unchanged row objects. Journal entries and trashed notes are excluded.
- **Columns are property names.** Property and option IDs are per note, so a
  column is keyed by the folded property name and options by their folded
  label. A column's type is the type most notes store under that name; a note
  that stores it under another type shows its raw value, muted, and refuses
  edits from the grid.
- **Edits are ordinary operations.** A cell edit is one `set_note_property`
  carrying the whole property, validated before it is submitted because the
  store drops an invalid property write silently. A missing property is
  created at the end of the note, and a missing option label is added to that
  note with the color other notes use. New notes are `create_note` plus the
  properties implied by the board group and equality filters they were made
  under.
- **Layouts are device-local settings.** Layout, column order and visibility,
  sorts, filters, grouping, and the subfolder toggle are stored per scope in the
  `databaseViews` settings extension (`{version: 1, views: {[scope]: view}}`).
  `update_settings` is device-local, so layouts do not sync. The document keeps
  at most 100 scopes, drops scopes whose folder no longer exists, and evicts the
  least recently changed scopes to stay under the domain's 256 KiB cap on its
  serialized size. A document from a newer version is shown read-only rather
  than overwritten, and the cap is a contract later versions keep.
- **Nothing new on the navigation path.** The view is statically imported, reads
  only in-memory state, virtualizes table rows at a fixed pitch, and caps board
  groups at 50 cards with "Show more".

## Consequences

- No migration, archive change, or sync rule: everything a database view shows
  already round-trips, and everything it writes is an existing operation.
- Layouts are per device. A person who wants the same board on two devices sets
  it up twice; making layouts sync is a separate decision about a synced
  settings extension.
- Two notes that use the same property name with different types share one
  column; the minority type is visible but read-only in the grid.
- Property edits now advance the note's updated time in the renderer, as the
  backend's `touch_note` already did, so the Updated column and recency sorts
  move immediately.
- Deferred: adding a property column to every note in a view at once, column
  widths, manual card order within a group, calendar and gallery layouts,
  formulas, and relations between notes.
