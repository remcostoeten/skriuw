# Checklist task promotion

Status: editor linkage foundation.

The typing-gesture integration that builds on this foundation is specified by
[ADR 0032](../adr/0032-task-shaped-typing-is-explicit.md).

## Invariant

A checklist item is document content until the user explicitly promotes it. Saving, opening, checking, unchecking, or editing an ordinary checklist item never creates a workspace task.

Promotion assigns two distinct stable identifiers:

- `taskId` addresses the future durable workspace task.
- `blockId` addresses the source checklist item inside its note.

The editor persists both identifiers in structured document JSON, HTML clipboard data, and a private Markdown marker. History restore and Markdown round-trips therefore retain the source link. Invalid, empty, already-linked, and non-checklist selections cannot be promoted.

Only checklist items carrying both valid identifiers enter the synchronization projection. Their visible text and checked state project to task title and `todo` or `done` status. Unpromoted checklist items are excluded.

## Durable feature gate

This foundation does not expose a promotion button or claim a Tasks workspace. Product integration requires a separate accepted domain and storage slice containing:

- a versioned portable `WorkspaceTask` record;
- explicit create, update, and delete operations;
- atomic SQLite persistence and bootstrap hydration;
- archive compatibility and migration coverage;
- optimistic renderer state with failure reconciliation;
- task list and source-note navigation surfaces;
- an editor command that persists the task before committing the source link, with a visible retry state if either write fails.

Checklist synchronization must remain off the editing and navigation paths. It may coalesce promoted-item updates after synchronous editor paint, but it cannot delay typing, note switching, or task completion feedback.
