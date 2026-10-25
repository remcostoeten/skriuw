# Database views

## Status

Implemented, 2026-10-18. The decision and its trade-offs are in
[ADR-0057](../adr/0057-database-views.md).

## Entry points

- Sidebar context menu: **Open as database** on a folder (`O`), **Open all notes
  as database** on the empty tree area (`O`).
- Command palette: **Open folder as database** (the focused folder, or the open
  note's folder) and **Open all notes as database**.
- Routes: `#/database` and `#/database/<folderId>`. A trashed, missing, or
  non-folder scope, and the journal root, render an explanation instead of a
  grid. The route keeps the notes sidebar.
- A board block inside a note: a fenced `database` block whose first line is
  the folder's path, inserted with **Database board** in the `/` menu ([ADR-0058](../adr/0058-database-board-blocks.md)).

## Model

Code lives in `packages/renderer-core/src/database/` (projection, columns,
filtering and sorting, write planning, stored layout) and
`apps/workspace/src/features/database/` (screens).

- `rows.ts`: notes in scope, in tree order. Folder scopes default to direct
  children; the workspace scope includes subfolders. Rows carry title, folder
  path, timestamps, word count (null when sealed), and the note's properties.
- `columns.ts`: Name, then Folder (when subfolders are included), then
  property columns in first-seen order, then Created, Updated, and Words.
  Property columns key on the folded name (`p:<name>`); options merge by
  folded label, keeping the first label and color seen.
- `arrange.ts`: the title search, AND filters, up to three sorts (empty values
  last, ties in tree order), and board groups. Select columns group into "No
  <name>" plus one group per option, empty groups included; checkbox columns
  group into unchecked and checked.
- `writes.ts`: `planCellWrite` and `planDatabaseNote` return operations or a
  refusal with a message the view shows inline. Refusals: the note is gone,
  the note stores the property under another type, the note already has 64
  properties, the property already has 64 options, or validation fails.
- `config.ts`: reading and writing the `databaseViews` settings extension.
  Filters and sorts that name a missing column are kept and reported as
  ignored rather than dropped.

## Table

- ARIA grid with one roving tab stop. The header row is part of the grid.
- Arrows move; Home and End reach the row ends; mod with an arrow, Home, or End
  reaches the grid's edges; Page Up and Page Down move by one viewport.
- Enter on Name opens the note; Enter or F2 elsewhere edits. F2 or a double
  click on Name renames. Space toggles a checkbox; digits 0 to 5 set a rating;
  Delete or Backspace clears a value; typing on a text, number, URL, email,
  phone, or location cell starts editing with that character.
- Text, number, and date cells edit in place; Enter and blur save, Escape
  discards. Select, multi-select, and person cells open a searchable picker;
  select and multi-select pickers can create an option by typing its label.
- Enter or Space on a header cycles that column's sort: ascending, descending,
  off.
- Rows are virtualized at a 36 px pitch with the header and Name column
  sticky. The focused cell follows its note when a sort moves it.
- **New note** at the bottom stays open after Enter for quick entry.

## Board

- One column per group of the chosen select or checkbox property, defaulting
  to a select named like Status, Stage, or State.
- Cards show the title and up to four visible properties. Cards are buttons in
  a roving tab order: arrows move within and across groups, Enter opens the
  note, and Alt with Left or Right moves the card to the neighboring group.
- Dragging a card onto a group writes the grouping property.
- Each group shows 50 cards at a time with **Show more**, and a **+** button
  that creates a note already in that group.

## Not included

See the deferred list in [ADR-0057](../adr/0057-database-views.md).
