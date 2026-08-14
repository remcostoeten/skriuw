# 0031 — Explicit task promotion

## Status

Accepted, 2026-08-14. Establishes the durable task record behind the existing
`features/editor/task-promotion.ts` seam.

## Context

The editor already preserves `taskId` and `blockId` attributes on `check_item`
nodes through JSON, DOM, Markdown, and history, but nothing durable stood
behind them. v1 shipped a `Task` table with status, priority, due date,
assignees, and a `(sourceNoteId, sourceBlockId)` link; v2 had the attributes
and no record.

Two failure modes decide the design. A checklist item that silently becomes a
task turns ordinary note-taking into workspace clutter. A promotion that writes
only one of its two halves leaves either a task nothing points at or a
checklist item claiming a task that does not exist.

## Decision

Tasks are canonical SQLite records with an explicit, indivisible link to their
source checklist item.

- `WorkspaceTask` carries title, status (`todo`/`in_progress`/`done`),
  priority, due date, description, tag and assignee ID collections, an
  optional `TaskSource { noteId, blockId }`, and `detachedAt`. Modelling the
  source as one optional pair makes a half-link unrepresentable.
- Promotion is a single operation. `PromoteChecklistTask` writes the source
  document and inserts the task in one transaction, then re-proves the link
  against the stored document. There is no operation group that could apply
  one half.
- Nothing promotes implicitly. `document_task_links` only sees `check_item`
  nodes carrying both attributes with a non-empty title; a checklist item
  without them produces no record, and a stale attribute pointing at no task
  row is inert.
- The document owns completion. Every document save reconciles the tasks
  linked to that note: the checklist text and checkbox win, a checked box
  completes the task, and unchecking reopens a completed task without
  discarding an `in_progress` state the checkbox cannot express.
- A task outlives its source. When a link disappears from the document, or the
  source note is purged, the task detaches — source cleared, `detachedAt`
  stamped — rather than being deleted. `workspace_tasks` therefore carries no
  foreign key to `workspace_nodes`: a cascade would destroy the record and an
  automatic `SET NULL` would break the paired link.
- The link only moves through promotion or detachment. `UpdateTask` rejects a
  record whose source or `detachedAt` differs from what is stored.
- Tasks are replicated workspace content, ship in archive version 4, and are
  re-validated against the documents and entities they travel with on every
  snapshot read and archive import.

## Consequences

- A task can exist with no source (quick-add or detached); every surface must
  render detached work rather than assume a note to navigate to.
- Editing the title or status of a linked task from a task surface must submit
  the rewritten source document alongside the record. Without it the next
  document save reconciles both back to what the checklist item says.
- Archive version 4 is the first format carrying tasks; versions 1 to 3 import
  with an empty task index.
- Duplicating a promoted checklist item inside one note yields two identical
  links. Neither is treated as authoritative, so the task keeps its stored
  title and status until the ambiguity is resolved in the document.
