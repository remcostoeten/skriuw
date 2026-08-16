# Tasks workspace view

## Status

Implemented, 2026-08-15. Follow-up to `docs/specs/tasks.md`, which delivered
the task model and the editor gesture. This document covers the `/tasks`
surface that model was designed for, and now records what shipped.

Two things the implementation added beyond the plan below:

- **Paired documents are applied optimistically.** `reduceState` ignored the
  `document` a task operation carries, so a toggle advanced the record and the
  acknowledgement bumped the stored revision while the local document kept the
  old checkbox — reverting the toggle on the note's next save. `store.ts` now
  runs the same document projection for `save_document` and for every task
  operation carrying one.
- **The paste identity gap is closed**, not just documented; see the final
  section.

## Goal

A workspace-wide surface listing every task, grouped by its source note, that
can toggle completion and navigate to the exact source block — without
introducing a second source of truth and without breaking the invariant that
the document owns the checklist item.

Target shape:

```
Tasks

Today
  ☐ Call Patrick                 Daily journal

Skriuw
  ☐ Fix WASM persistence         Browser runtime

No source
  ☐ Investigate Loket API        (detached)
```

## Prerequisites

Read first, in order:

1. `docs/specs/tasks.md` — the model this view renders. Especially "Stable
   identity and source navigation" and "Future Task projection / `/tasks`".
2. `docs/adr/0031-explicit-task-promotion.md` — binding. The "Consequences"
   section contains the rule that decides this entire feature.
3. `docs/adr/0032-task-shaped-typing-is-explicit.md`.
4. `docs/performance-contract.md`.

## What already exists

Do not rebuild any of this.

- `RendererState.tasks: ReadonlyMap<string, WorkspaceTask>`
  (`app/src/store/types.ts:82`), hydrated from `snapshot.tasks` at
  `app/src/store/store.ts:243`.
- All five task operations are applied to that map at `store.ts:301-324`,
  including local detachment mirroring.
- `WorkspaceTask`, `TaskSource`, `TaskSourceDocument`, `TaskStatus`,
  `TaskPriority` in `app/src/contracts/workspace.ts:115-145`.
- Backend handlers for `create_task`, `update_task`, `delete_task`,
  `detach_task`, `promote_checklist_task`, plus `reconcile_note_tasks`, in
  `crates/skriuw-sqlite/src/operations.rs`.
- The editor gesture, `/task` slash command, and `task-linking.ts` promotion
  reconciler.

What is missing is the surface itself: a route, a rail entry, a view, and the
toggle/navigation actions.

---

## The rule that shapes this feature

From ADR 0031's Consequences, and enforced in
`crates/skriuw-sqlite/src/operations.rs`:

> Editing the title or status of a linked task from a task surface must submit
> the rewritten source document alongside the record. Without it the next
> document save reconciles both back to what the checklist item says.

`reconcile_note_tasks` runs on **every** `SaveDocument` and treats the document
as authoritative: the checklist text and checkbox win. So a task view that
submits `update_task` alone produces a change that silently reverts the next
time anyone edits that note.

Therefore **every mutation from this view is a paired write**: the
`WorkspaceTask` record and the rewritten source document, in one operation, in
one transaction.

`UpdateTask` additionally rejects any record whose `source` or `detachedAt`
differs from what is stored (`operations.rs:837-846`). This view must never
attempt to move or clear a link — that happens only through promotion or
detachment.

### The precedent to copy

`app/src/features/references/entity-merge.ts` already rewrites the documents of
notes that are not open in any editor, for entity merges. Its
`buildMergeSaveDocuments` is the exact shape to follow:

```ts
const record = state.documents.get(noteId);
const { node, changed } = rewriteNode(record.documentJson, …);
const document = productSchema.nodeFromJSON(node);
operations.push({
  type: "save_document",
  noteId, documentJson: node,
  markdown: serializeProductMarkdown(document),
  wordCount: countWords(document),
  expectedRevision: record.revision,
  at,
});
```

For tasks, build a `TaskSourceDocument` with the same five fields — its shape is
identical apart from the operation wrapper:

```ts
type TaskSourceDocument = {
  noteId: string; documentJson: unknown; markdown: string;
  wordCount: number; expectedRevision: number;
};
```

---

## Scope

### v1

- `#/tasks` route, rail entry, and a `goToTasks` command.
- A list of every task, grouped by source note, with a group for detached tasks.
- Toggle completion (open ↔ done) as a paired write.
- Navigate to the source note and reveal the exact source block.
- Empty state.
- Full keyboard operation.

### Non-goals

- Editing task title from the view. The document owns the text; inline title
  editing is a paired write too, but it is a separate, larger change and the
  editor already offers the ergonomic path.
- Due dates, priority, recurrence, assignees, tags, descriptions. The fields
  exist on `WorkspaceTask`; nothing exposes them and nothing should yet.
- `in_progress` status. A checkbox has two states. Exposing the third means
  deciding what an `in_progress` task's checkbox looks like — defer it.
- Creating a task from this view (quick-add). It would produce a task with no
  source, which is representable but is a distinct interaction worth its own
  design.
- Deleting tasks, filtering, sorting, search, saved views, Kanban.
- Reordering.

---

## Route and navigation

`app/src/app-route.ts`:

- Add `"tasks"` to the `AppRoute` union at line 3.
- Add `if (hash === "#/tasks" || hash.startsWith("#/tasks/")) return "tasks";`
  to `resolveAppRoute`, before the `notes` fallback.
- Add `tasks` to the `resolveRouteFocus` regexp alternation
  (`/^#\/(?:tags|people|history|journal)\/…/`) if you support deep-linking to a
  single task. Recommended: **yes**, `#/tasks/<taskId>` focuses that row, which
  makes the surface linkable from a future notification or search result.

`app/src/commands/rail-items.ts`:

- Add `{ actionId: "goToTasks", route: "tasks", label: "Tasks", section: "primary" }`
  after the Journal entry.

`app/src/commands/definitions.ts` and `app/src/app.tsx`:

- Add a `goToTasks` command definition following `goToJournal`
  (`app.tsx:91`), and render `{route === "tasks" && <TasksView store={store} />}`
  alongside the other route branches at `app.tsx:569-579`.

Pick an icon from `@/shared/icons/static` — `ListTodoIcon` is already used by
both the check-list and task slash commands and reads correctly here.

---

## View structure

New feature folder `app/src/features/tasks/`, mirroring how `references`,
`journal`, and `trash` are organized:

| File | Responsibility |
| --- | --- |
| `tasks-view.tsx` | The surface. Rendering, keyboard, focus. No document rewriting. |
| `tasks-model.ts` | Pure projection: `RendererState` → grouped rows. Plus row equality. |
| `task-operations.ts` | Builds the paired-write operations. No React. |
| `tasks.css` | Only if the surface needs styles the design system does not cover. |

This split matters: `tasks-model.ts` and `task-operations.ts` must be unit
testable without a DOM, exactly as `entity-manager-model.ts` and
`entity-merge.ts` are.

`TasksView` is a full-screen surface, so **it must host `WindowControls`
itself** — see `app/src/shell/window-controls.tsx` and how
`app/src/features/references/entity-view.tsx` imports and places it. There is
no shared chrome that does this for you.

### Projection

`tasks-model.ts` exports something like:

```ts
export type TaskRow = {
  id: string;
  title: string;
  done: boolean;
  noteId: string | null;
  noteTitle: string | null;
  blockId: string | null;
  detached: boolean;
};

export type TaskGroup = { noteId: string | null; noteTitle: string; rows: readonly TaskRow[] };

export function projectTasks(state: RendererState): readonly TaskGroup[];
```

Rules:

- Iterate `state.tasks`, not documents. The map is the projection; never scan
  the workspace's documents to build this view. That is a performance-contract
  violation and it would also disagree with the backend on detached tasks.
- Resolve the note title through `state.nodes.get(source.noteId)`, following
  how `entity-manager-model.ts` resolves note names.
- A task whose `source` is `null` (quick-add or detached) goes into a trailing
  group. Label it "No source". ADR 0031 is explicit that every surface must
  render detached work rather than assume a note exists.
- A task whose `source.noteId` resolves to no node — the note was purged —
  also belongs in that group. Do not drop it.
- Sort groups by note title, then rows by `createdAt`. Keep it deterministic;
  an unstable order makes the list jump when anything reconciles.
- Provide a `taskRowsEqual` comparator and use it with
  `useRendererSelector` (`app/src/store/use-renderer-selector.ts`) so the view
  re-renders only when the projected rows actually change — mirroring
  `entityRowsEqual` in `entity-manager-model.ts`.

---

## Toggling completion

This is the feature's hard part. Implement it in `task-operations.ts`.

```ts
export function buildTaskToggle(
  state: RendererState,
  taskId: string,
  at: number,
): WorkspaceOperation[]
```

Steps:

1. Look up the task in `state.tasks`. If absent, return `[]`.
2. If `task.source === null`, the task is detached and has no document to
   rewrite. Submit `update_task` with `document: null` and the flipped status.
   This is the one case where a lone record write is correct, and the backend
   permits it because `source` is unchanged.
3. Otherwise read `state.documents.get(task.source.noteId)`. If absent, return
   `[]` rather than guessing — a missing document record means the note is not
   loaded and the write would be unsafe.
4. Walk `record.documentJson` for the `check_item` whose
   `attrs.blockId === task.source.blockId`, and flip its `attrs.checked`.
   Structure the walk like `rewriteNode` in `entity-merge.ts`: return
   `{node, changed}` so an unchanged document short-circuits.
5. If no matching block was found, return `[]`. The document and the record
   disagree; the next save will detach the task, and forcing a write here would
   fight that.
6. If **more than one** block matches, return `[]` and surface it. ADR 0031
   says duplicated links are not authoritative, and `unique_document_task_link`
   on the backend will reject the operation anyway. Failing early with a clear
   message beats a rejected round trip.
7. Build the paired operation:

```ts
{
  type: "update_task",
  task: { ...task, status: nextStatus, updatedAt: at },
  document: {
    noteId, documentJson: node,
    markdown: serializeProductMarkdown(document),
    wordCount: countWords(document),
    expectedRevision: record.revision,
  },
}
```

`nextStatus` is `done` when checking. When unchecking, use `todo` — but note
the backend's `WorkspaceTask::reconciled_status` deliberately preserves
`in_progress` when the checkbox cannot express it. Since this view never sets
`in_progress`, `todo` is correct here; do not replicate the reconciliation
logic in the renderer.

Submit through `commitOperations` from `@/store/actions/workspace`, as
`entity-view.tsx` does.

### The open-editor hazard

`expectedRevision` comes from `state.documents.get(noteId).revision`. If that
note is open in an editor with unsaved changes, the editor's in-memory document
is ahead of the store record, and this write will either be rejected on
revision mismatch or land and then be overwritten by the editor's next save.

The editor stages its document via `preparedDocuments.stage(...)`
(`app/src/features/editor/prepared-documents.ts:57`) and saves on a debounce
(`note-editor.tsx:546`). Options, in preference order:

1. **Flush first.** Before building the toggle, ask the editor to persist the
   note if it is dirty, then build from the fresh record. This is correct and
   matches what a user expects, but needs a small seam exposed from
   `note-editor.tsx` — there is no existing "flush this note now" export, so
   you will be adding one.
2. **Decline.** If the note is open and dirty, do not toggle from this view;
   show why. Safe but poor.

Recommended: option 1. Verify how `dirtyNoteIdsRef` and the save sequencer in
`note-editor.tsx` are reachable before committing to it — that check is the
first thing to do in this section, and it may change the shape of the seam.

---

## Source navigation

Clicking a row's note label, or pressing Enter on a focused row, navigates to
the source.

Follow `app/src/features/references/reference-navigation.ts`, which pushes the
current location onto a back stack before jumping so `navigateBack` can return
the reader. Reuse that module rather than writing a second back stack.

```
store.setActiveNote(task.source.noteId)
window.location.hash = appRouteHash("notes")
→ reveal the block whose blockId matches task.source.blockId
```

Revealing the block: the editor already exposes reveal helpers that dispatch
`tr.setSelection(...).scrollIntoView()` — see `note-editor.tsx:894` and `:929`
for the document-edge case. You will need an equivalent keyed by `blockId`:
resolve the position of the `check_item` carrying that attribute, select it,
scroll it into view.

Detached tasks have no source. Their rows must not offer navigation, and must
not render a dead affordance.

---

## Accessibility

- Each row's checkbox is a real control with an accessible name (the task
  title), `role="checkbox"` or a native `<input type="checkbox">`, and
  `aria-checked`. Prefer the native input on this surface; unlike the editor,
  there is no ProseMirror constraint forcing a span.
- The list is keyboard navigable: arrow keys move focus between rows, Space
  toggles, Enter navigates to source. Follow the roving-focus pattern used by
  the sidebar tree and `entity-view.tsx`.
- Honour the 60% keyboard constraint recorded in this repository's
  conventions: no Home/End/PageUp/PageDown-only bindings, and provide
  `Shift`+arrow aliases where you would reach for them.
- Group headings are real headings, so a screen reader can navigate by note.
- Completed tasks must not be conveyed by strikethrough alone; the checkbox
  state carries it.
- The empty state is announced, not just drawn.

## Visual behavior

Follow the existing design system and the quiet-chrome convention recorded for
this repository: sentence-case section labels, compact headers, no tall
uppercase headings. Look at `entity-view.tsx` and the sidebar for the
established density.

Do not build task cards, colored status pills, priority badges, Kanban
columns, or a productivity dashboard. A row is a checkbox, a title, and a muted
note label. Completed rows are de-emphasized.

## Performance

- The view subscribes through a narrow selector with a row comparator. It must
  not subscribe to `state.tasks` wholesale and re-render on unrelated
  workspace changes.
- The projection is O(tasks), runs during render, and is not memoized into
  state. Derive during render — do not synchronize with an effect.
- Toggling walks **one** document, not the workspace.
- Navigating away from `/tasks` must not remount the editor host. Check how the
  other route branches in `app.tsx:569-579` are mounted before adding yours;
  the notes surface at `app.tsx:418` is kept mounted deliberately.
- No IPC, database read, or Markdown parse on the navigation path into this
  view. The data is already in the store.

---

## Files expected to change

| File | Why |
| --- | --- |
| `app/src/app-route.ts` | `tasks` route + focus parsing |
| `app/src/commands/rail-items.ts` | Rail entry |
| `app/src/commands/definitions.ts` | `goToTasks` command |
| `app/src/app.tsx` | Route branch + action mapping |
| `app/src/features/tasks/tasks-view.tsx` *(new)* | The surface; hosts `WindowControls` |
| `app/src/features/tasks/tasks-model.ts` *(new)* | Pure projection + row equality |
| `app/src/features/tasks/task-operations.ts` *(new)* | Paired-write builders |
| `app/src/features/editor/note-editor.tsx` | Reveal-by-blockId, and `transformPasted` for task identity |
| `app/src/features/editor/reveal-controller.ts` *(new)* | Cross-route reveal request, replayed after the note switch |
| `app/src/features/editor/block-locations.ts` *(new)* | Position and top-level index of a `blockId` |
| `app/src/features/editor/task-paste.ts` *(new)* | Fresh identity for pasted `check_item`s |
| `app/src/store/store.ts` | Apply a task operation's paired document optimistically |
| `app/__tests__/features/tasks/tasks-model.test.ts` *(new)* | Projection, grouping, detached handling |
| `app/__tests__/features/tasks/task-operations.test.ts` *(new)* | Paired writes, refusal cases |
| `docs/FEATURES.md` | Document the surface |

Do not change anything under `crates/`, `contracts/generated/`, or
`app/src/contracts/workspace.ts`. If you need a new operation type, stop and
re-read ADR 0031 — the five that exist are sufficient.

## Implementation order

1. `tasks-model.ts` + its tests. Pure, no UI, fastest feedback.
2. Route, rail entry, command, and a read-only `TasksView` that renders groups.
3. `task-operations.ts` + its tests, including every refusal case.
4. Wire toggling, including the open-editor flush seam.
5. Source navigation and block reveal.
6. Keyboard operation and accessibility.
7. `docs/FEATURES.md`.

Steps 1–2 are shippable alone as a read-only surface.

---

## Test plan

### Projection (`tasks-model.test.ts`)

- [ ] Tasks group under their source note's title.
- [ ] Two tasks in one note land in one group, ordered by `createdAt`.
- [ ] A task with `source: null` lands in the "No source" group.
- [ ] A task whose `source.noteId` resolves to no node lands in "No source"
      rather than being dropped.
- [ ] Groups are ordered deterministically across repeated projections.
- [ ] `done` tasks are marked as such and are not filtered out.
- [ ] `taskRowsEqual` returns true for structurally identical projections, so
      the view does not re-render on unrelated store changes.
- [ ] An empty task map projects to zero groups.

### Operations (`task-operations.test.ts`)

- [ ] Toggling an open linked task emits one `update_task` carrying both the
      record with `status: "done"` and a `document` whose matching
      `check_item` has `checked: true`.
- [ ] The emitted `document.markdown` matches
      `serializeProductMarkdown` of the rewritten document.
- [ ] `document.expectedRevision` equals the store record's revision.
- [ ] The emitted task preserves `source`, `detachedAt`, `priority`,
      `dueDate`, `description`, `tagIds`, and `assigneeIds` unchanged — the
      backend rejects source/detachment drift.
- [ ] Unchecking a done task emits `status: "todo"`.
- [ ] Toggling a detached task emits `update_task` with `document: null`.
- [ ] A task whose source note has no document record emits nothing.
- [ ] A task whose `blockId` matches no block emits nothing.
- [ ] A task whose `blockId` matches two blocks emits nothing and reports why.
- [ ] An unknown task id emits nothing.

### View

- [ ] Toggling a row updates it optimistically and survives the round trip.
- [ ] Toggling a row, then opening the source note, shows the checkbox in the
      matching state.
- [ ] Editing the checklist item in the editor updates the row — the
      reconciliation path already exists; this asserts the view observes it.
- [ ] Deleting the source line detaches the task and moves the row into "No
      source" rather than removing it.
- [ ] Enter on a focused row opens the source note with the block revealed.
- [ ] A detached row offers no navigation affordance.
- [ ] Arrow keys move focus, Space toggles, and focus is never trapped.
- [ ] The empty state renders when there are no tasks.

### Regression

- [ ] `app/__tests__/features/editor/tasks.test.ts`,
      `task-promotion.test.ts`, and `check-list.test.ts` pass unmodified.
- [ ] `./scripts/check.sh` passes.

---

## Acceptance criteria

1. `#/tasks` renders every task in the workspace, grouped by source note.
2. Detached and orphaned tasks render in their own group and are never dropped.
3. Toggling completion from the view submits the record and the rewritten
   source document in one `update_task` operation.
4. A toggle made from the view survives the next edit to its source note — it
   is not reconciled away.
5. The view never submits a task whose `source` or `detachedAt` differs from
   what is stored.
6. Ambiguous, missing, and unloaded sources refuse the write with a clear
   reason rather than writing something wrong.
7. A row navigates to its source note and reveals the exact source block.
8. The surface is fully keyboard operable and screen-reader legible.
9. No new table, migration, operation type, or generated contract.
10. The view is built from `RendererState.tasks`, never from a workspace-wide
    document scan.
11. Entering and leaving `/tasks` does not remount the editor host.
12. New tests cover projection, paired writes, and every refusal case.

---

## Resolved questions

1. **The open-editor flush seam.** No new export was needed. `note-editor.tsx`
   already registers `flushPendingSave` with `@/shell/pending-work`, so the
   view awaits `flushPendingWork()` before reading the document — which also
   covers a dirty note that is not the active one. A rejected flush
   (`SaveFlushError`) refuses the toggle and says so rather than writing
   against a revision the backend never accepted.
2. **Deep links.** `#/tasks/<taskId>` was added to the `resolveRouteFocus`
   alternation; no dedicated resolver was needed, and `taskFocusHash` is the
   builder beside `entityFocusHash`.
3. **Grouping key for journal notes.** Left per-note. Each journal entry titles
   itself by its day, so its group heading is already the day; collapsing them
   under one "Journal" heading would hide which day the task came from.

## Still open

- **Reveal in bounded documents.** `revealRequestedBlock` mirrors the bounded
  branch of `commitJumpToLine`: it moves the window and remembers the
  selection at offset 0 of the containing top-level block, so a check item
  nested deep inside a large block reveals the block rather than the line.
  Unbounded notes select the item itself.
- **The view's own behaviour is not covered by automated tests.** The renderer
  suite runs `__tests__/**/*.test.ts` only, so `tasks-view.tsx` has no test
  file; the projection, the paired writes, every refusal case, the paste
  rewrite, and block location are covered. The "View" checklist below has not
  been run against a running application.

## Gap closed: paste-time identity

Copying a task inside Skriuw used to produce two `check_item`s carrying the
same `taskId`, because identity survives both clipboard formats — the DOM path
via `data-task-id`/`data-block-id` and the Markdown path via the marker
comment. `unique_document_task_link` will not match a duplicated link, so
`reconcile_note_tasks` stopped reconciling that task and toggling it from here
hit refusal case 6.

`app/src/features/editor/task-paste.ts` now regenerates `taskId`/`blockId` on
every pasted `check_item`. It is wired twice, because the two paste paths do
not share a slice: as `transformPasted` on the editor view, and inside
`markdownPasteSlice`, which dispatches its own slice and never reaches
`transformPasted`.
