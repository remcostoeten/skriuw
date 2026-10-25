# ADR-0058: A folder's board can be embedded in a note

- Status: accepted
- Date: 2026-10-25
- Supersedes: the rejection of embedded blocks in
  [ADR-0057](0057-database-views.md)

## Context

ADR-0057 made database views a route and rejected an embedded block, because a
React grid inside ProseMirror would pull cross-note projections into the
editing path and need a document schema change.

The route alone works badly as a first impression. The starter workspace sent a
first browser visit to the Books board, a full-width grid without the sidebar or
any explanation, so a new visitor met a property board before they met the
editor. A board shown inside a note can be introduced by the text around it,
and it shows that notes and their properties are the same thing.

## Decision

A `database_view` block shows one folder's notes as a board inside a note.

- **Markdown is a fence.** The block is written as a fenced code block with the
  language `database` whose first non-empty line is the folder's path from the
  workspace root, for example `Projects/Books`. Other editors show it as a
  short code block. An empty fence is a block that asks for a folder.
- **The block stores a path, not an ID.** The path survives export, import and
  copying between workspaces. Titles are compared case-insensitively. A path
  that names no live folder, including one that was renamed, shows a folder
  picker instead of a board, and choosing a folder rewrites the path.
- **One source of truth.** The block reads the same rows selector and the same
  device-local layout scope as `#/database/<folderId>`, always as a board. It
  writes only through the existing cell and note operations. It never changes
  the stored layout, so it has no toolbar.
- **Off the editing path.** The block is an atom with its own React root.
  ProseMirror never sees events inside it, and it subscribes only to its own
  folder's rows, so typing elsewhere in the note does not render it. Board
  groups keep the 50-card cap.
- **Entry points.** **Database board** in the `/` menu inserts an empty block,
  and pasting or importing the fence creates a filled one. The block links to
  the full view.

The database route also gains the notes sidebar. Opening a note from the
sidebar leaves the board for that note.

## Consequences

- The document schema has one more node type. Documents written before it
  parse the fence as the block, and documents with the block open in older
  builds as a `database` code block, because the markdown is unchanged.
- Renaming or moving a folder breaks the paths that name it until a folder is
  chosen again. Resolving by ID would survive renames but not export.
- The starter workspace opens on the Welcome note, which embeds the Books
  board, instead of on the database route.
- Deferred: embedding a table, per-block layouts, filters chosen in the block,
  and updating paths when a folder is renamed.
