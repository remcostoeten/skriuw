# 0034 — Annotation anchors are document data, conversations are not

## Status

Accepted, 2026-08-22.

## Context

A comment thread has two halves that want different homes. The *anchor* — which
text is being commented on — only means anything relative to the document, and
must survive every edit above it, undo, split-view, Markdown export, and import
into another editor. The *conversation* — bodies, timestamps, resolution — is
workspace content: it is queried per note, replicated by sync, and must remain
readable after the text it points at is deleted.

Storing both in the document would put comment bodies into every Markdown
export and force a full document save on each reply, violating the editing
performance contract. Storing both in the workspace would need positional
offsets, which every keystroke above the anchor invalidates.

## Decision

Split them at the identity boundary. The document carries a ProseMirror
`annotation` mark whose only attribute is a `threadId`; the workspace carries a
`WorkspaceAnnotation` entity keyed by that id. Position is expressed solely by
where the mark sits, so ProseMirror's own mapping keeps anchors correct through
arbitrary edits and no offset is ever persisted.

The mark is `inclusive: false` (typing at an anchor edge stays outside the
thread) and `excludes: ""` (threads may overlap and nest). It serializes as
`<mark data-skriuw-annotation="…">`, so another editor sees the anchored text
with harmless markup rather than losing it.

Three consequences of the split are settled here:

- The thread stores an `anchorText` snapshot taken at creation. A thread whose
  anchor is deleted is not destroyed; it becomes unanchored, still listed and
  still readable, labelled from that snapshot.
- A thread does not outlive its **note**. Deleting a note purges and tombstones
  its threads. This deliberately differs from tasks (ADR 0031), which detach
  from their block and survive, because a comment without its note has no
  subject at all.
- Deleting the last comment keeps the thread. An empty thread is a legible
  state; destroying it implicitly would silently discard the anchor.

## Consequences

Replying, editing, resolving, and reopening are workspace operations that never
touch the document, so they cost no document save and no re-parse. Only creating
a thread and deleting a thread write both halves, and each does so in one
operation batch.

Markdown gains one `<mark>` element per anchor. Because highlight already
serializes to `<mark>`, the close tag is ambiguous and the inline parser must
track open tags on a stack to attribute `</mark>` correctly; any future mark
serializing as `<mark>` joins that stack. This is the price of portable anchors
and is accepted over a private fence syntax that other editors would show raw.

Threads are found by walking the document for marks, which is bounded by the
note, not the workspace. Both the inspector list and the two navigation
shortcuts resolve against the full document rather than the bounded editor
window, so a thread anchored outside the visible window is reachable rather than
reported missing.

Implementation contract: [`docs/specs/annotations.md`](../specs/annotations.md).
