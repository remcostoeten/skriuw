# Inline annotations

Status: implemented.

## Goal

Let a writer attach a comment thread to a range of text inside a note, reply to
it, resolve it, and navigate between threads — without the thread bodies ever
entering the document. Anchors live in the note; conversations live in the
workspace.

## Non-goals

- No multi-user presence, mentions, or notifications. A thread records what was
  said and when, not who is typing.
- No cross-note threads. A thread belongs to exactly one note.
- No thread that outlives its note. Deleting the note purges its threads.
- No standalone "comments" route. Threads are reachable from the note they
  annotate: the editor popover, the inspector list, and the two navigation
  shortcuts.

## Anchor

The anchor is a ProseMirror mark, `annotation`, carrying a single attribute:

```
threadId: string
```

The mark is `inclusive: false` and `excludes: ""`. Non-inclusive keeps typing at
either edge of an anchor outside the thread; an empty `excludes` lets threads
overlap and nest, which reviewers expect and which the range walker in
`annotation-menu.tsx` relies on.

Markdown serialization is an HTML `mark` element:

```html
<mark data-skriuw-annotation="thread-id">anchored text</mark>
```

Highlight marks serialize to `<mark>` as well, so the close tag alone is
ambiguous. `richFormattingTagRule` keeps an open-tag stack on `state.env` and
pops it to decide which mark a `</mark>` ends; an unbalanced close falls back to
highlight, preserving pre-annotation behavior. **Any future mark that serializes
as `<mark>` must join that stack.** Highlight's `parseDOM` returns `false` for
elements carrying `data-skriuw-annotation`, so a pasted anchor does not decay
into a stray yellow highlight.

The anchored text is also copied into the thread's `anchorText` field at
creation time. That copy is what the inspector list shows, so a thread stays
identifiable after its anchor is deleted from the document.

## Thread entity

`WorkspaceAnnotation` (`crates/skriuw-domain/src/annotation.rs`,
`app/src/contracts/workspace.ts`):

| Field        | Meaning                                            |
| ------------ | -------------------------------------------------- |
| `id`         | Thread identity; the value carried by the mark      |
| `noteId`     | Owning note                                        |
| `status`     | `open` or `resolved`                               |
| `anchorText` | Snapshot of the anchored text at creation          |
| `createdAt`  | Epoch milliseconds                                 |
| `resolvedAt` | Epoch milliseconds, or `null`                      |
| `comments`   | Ordered `AnnotationComment[]`                      |

Bounds: `MAX_ANNOTATION_COMMENT_BYTES` 4000, `MAX_ANNOTATION_ANCHOR_TEXT_BYTES`
2000, `MAX_ANNOTATION_COMMENTS` 200. Validation rejects an anchor whose thread id
is not `[A-Za-z0-9_-]+`, which is also the character class the Markdown parse
rule accepts.

Storage is `0019_note_annotations.sql`. Threads are carried by workspace
archives from version 6 onward.

## Operations

Seven operations, all validated in the domain layer and replicated by
`WORKSPACE_OPERATION_SYNC_POLICY_V1`:

- `create_annotation`
- `add_annotation_comment`
- `update_annotation_comment`
- `delete_annotation_comment`
- `resolve_annotation`
- `reopen_annotation`
- `delete_annotation`

`validate_as_created` forces status `open`, so first-sync replay of an already
resolved thread is emitted as create-then-resolve by `initial_sync_operations`.

Deleting the last *comment* keeps the thread — an empty thread is a legible
state ("every comment here was deleted"), and destroying it implicitly would
lose the anchor. Only `delete_annotation` destroys a thread, and it tombstones.

Deleting a note purges its threads and tombstones them. This is the one place
annotations differ from tasks: a task detaches from its block and survives, an
annotation does not.

Adding an eighth operation trips three guards: the
`WORKSPACE_OPERATION_SYNC_POLICY_V1` length assertion, the byte-immutability
checksum list for shipped migrations, and the archive-fixture manifest.

## Editor surface

- **Create** — with a non-empty selection, `mod+shift+m` or the bubble-menu
  button opens the composer. Submitting applies the mark and emits
  `create_annotation` in one batch.
- **Open** — placing the caret inside an anchor and pressing `mod+shift+m`
  opens that thread's popover. Nested anchors resolve to the innermost.
- **Popover** — comment list with per-comment edit and delete, a reply
  composer, Resolve/Reopen, and Delete thread. Enter submits, `shift`+Enter
  inserts a newline, Escape closes and returns focus to the editor.
- **Navigate** — `mod+alt+arrowdown` and `mod+alt+arrowup` step to the next and
  previous anchor in document order and open it, wrapping at either end.

Ordering and reveal both resolve against the *full* document, not the live
bounded window, so a thread anchored outside the visible 192-block window shifts
the window into view instead of silently failing. See
`docs/specs/bounded-workspace-intake.md`.

## Anchor appearance

A thread's status lives in the workspace, so resolving one must not write the
note. The mark therefore carries no status and `mark[data-skriuw-annotation]`
has no tint of its own; `annotation-decorations.ts` paints every anchor from
state the editor pushes in:

| Class | Applied to |
| --- | --- |
| `skriuw-annotation` | Any anchor — tint plus underline |
| `skriuw-annotation--resolved` | A resolved thread — no tint |
| `skriuw-annotation--active` | The thread whose popover is open — stronger tint plus a ring |

The plugin owns the whole appearance rather than subtracting from a base rule
because a ProseMirror inline decoration renders *inside* the schema mark, and a
child element cannot repaint the `<mark>` wrapping it.

Inputs arrive as a plugin-key meta transaction carrying `addToHistory: false` —
how a thread looks is not an edit and undo must not step through it. A push with
unchanged inputs dispatches nothing. Two paths keep the state fresh: an effect
in `note-editor.tsx` keyed on the note's annotations and the open popover, and a
re-push inside `installBoundedWindow`, since a rebuilt window starts from a fresh
plugin state.

Decorations are rebuilt on `docChanged` rather than mapped through `tr.mapping`.
A transaction can add or remove an anchor without announcing it — undo restores
a deleted mark, and a paste can carry anchors in — and mapping alone would leave
those unpainted until the next explicit push. The walk is bounded by the editor
window, not the workspace.

## Inspector surface

The metadata panel gains a **Comments** section, rendered only when the active
note has at least one thread. Entries show the anchor text, a relative
timestamp, the first comment, and a reply count. A filter chooses Open (default),
Resolved, or All. Clicking an entry issues a thread reveal through
`reveal-controller.ts`, the same seam block reveal uses — the editor performs the
reveal because only it can move the bounded window.

Orphan detection ("original text deleted") runs against the note's saved
Markdown rather than the rendered document, for the same window reason: a thread
anchored outside the window is not absent, only off-screen.

## Testing

Behavior is covered through public surfaces: mark round-trips and the
overlapping-`</mark>` case in the editor schema tests, operation validation and
replay in the domain crate, projection folding in the renderer store tests, and
anchor detection plus per-note ordering in
`app/__tests__/features/note-chrome/annotation-list-model.test.ts`.

## References

- [ADR 0034 — Annotation anchors are document data, conversations are not](../adr/0034-annotation-anchors-are-document-data.md)
- [`docs/specs/workspace-operation-sync-policy-v1.md`](workspace-operation-sync-policy-v1.md)
- [`docs/specs/bounded-workspace-intake.md`](bounded-workspace-intake.md)
