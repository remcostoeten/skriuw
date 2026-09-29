# ADR-0053: Task due dates live in the checklist line

- Status: accepted
- Date: 2026-09-29

## Context

`WorkspaceTask` has carried a `dueDate` since [ADR-0031](0031-explicit-task-promotion.md),
but nothing set it. A date that only exists in SQLite would disappear from the
note's Markdown, so an exported vault, a Git projection, or another editor would
lose it. ADR-0031 already makes the source document own a linked task's title
and completion; a second field with a different owner would give the record and
the checklist item two ways to disagree.

## Decision

- The date is a `dueDate` attribute on `check_item`, a `YYYY-MM-DD` day with no
  time or zone. Unlinked checklist items may carry one too; like any checkbox,
  that stays document-only content and never creates a task.
- Markdown spells it as the [Obsidian Tasks](https://publish.obsidian.md/tasks/)
  due-date signifier at the end of the item's first line, after the private task
  marker: `- [ ] Ship it <!--skriuw-task:t:b--> 📅 2026-10-01`. Obsidian Tasks only
  reads signifiers at the end of the line, so the date goes last. The parser
  reads marker and date in either order and leaves a token that names no real
  day as literal text.
- The document owns the date. Every save reconciles a linked task's `due_date`
  from its checklist item, including clearing it, exactly as it reconciles the
  title and checkbox. Setting a date from the tasks view is a paired
  `update_task` that rewrites the item in the same operation.
- The renderer mirrors that reconciliation when it projects a save, so the tasks
  view follows edits made in the editor without waiting for a snapshot.
- In the editor, typing `due:<date>` and a space on a checklist line sets the
  date; the chip it renders turns back into that token on Enter or click and
  clears on Delete.

## Consequences

- No migration: `workspace_tasks.due_date` already exists and archives already
  export it.
- A due date stored only on the record, for example from an archive written
  before this decision, is cleared by the next save of its source note.
- Other tools' date conventions (`due:` in todo.txt, `DEADLINE:` in Logseq) are
  not read from Markdown. Typing `due:` is an editor gesture, not a file format.
