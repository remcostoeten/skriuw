# 0032 — Task-shaped typing is explicit intent

## Status

Accepted, 2026-08-15.

## Context

ADR 0031 forbids implicit promotion so imported Markdown and ordinary
checklists cannot silently fill the workspace task index. A compound editor
gesture can nevertheless express intent more precisely than portable Markdown:
the user first opens a bullet item, then types a complete checkbox marker.

## Decision

Typing `- `, `* `, or `+ ` followed by `[] `, `[ ] `, `[x] `, or `[X] ` in a
fresh top-level bullet item explicitly creates a linked task. The editor assigns
fresh task and block identities immediately; durable promotion remains deferred
to the normal save debounce and requires a non-empty title.

Document shape alone is never intent. Imported, pasted, or parsed `- [ ]`
Markdown remains an unlinked checkbox unless it carries Skriuw's private task
marker. Continuing a non-empty task with Enter creates a new task with new
identities. Empty linked items serialize without a marker and are never
promoted.

## Consequences

The editor keeps the same portable Markdown presentation for tasks and
checkboxes while preserving the source link required by ADR 0031. No typing
gesture performs IPC or storage work, so the editing performance contract stays
intact.
