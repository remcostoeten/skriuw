# First-class tasks

## Status

Proposed implementation specification, 2026-08-15. Extends `docs/specs/task-promotion.md`
and implements the renderer half of `docs/adr/0031-explicit-task-promotion.md`.

This document is written for an implementing agent with no prior conversation
context. Every repository claim below was verified against the working tree on
branch `feature/relation-graphcl` at commit `e37739cc`, several by executing the
editor code. Where the investigation contradicted the original product sketch,
the contradiction is stated explicitly rather than smoothed over.

## Settled implementation decisions

The following decisions supersede any older defaults in this specification:

1. Enter in a non-empty task continues the task list. The new item receives a
   fresh `taskId`/`blockId` pair; Enter on an empty item still exits the list.
2. Empty linked items retain their in-memory ids, but serialization emits a
   task marker only when the item has non-empty text. This avoids save-path
   document mutations and lets a later parse clean up an abandoned empty item.
3. Linked-item markers serialize on the same line as their text. The parser
   continues to accept the existing two-line form for compatibility.

## Goal

Give Skriuw a first-class Task that is distinct from an ordinary checklist
checkbox, reachable by typing `- [ ] ` (and the shorthand `- [] `), reachable
from the slash menu, portable through standard Markdown, and addressable by a
future `/tasks` workspace surface — without introducing a second source of
truth and without breaking the existing checkbox.

## Existing behavior

Verified by running the editor in `node --test` against
`app/src/features/editor/schema.ts`. Do not re-derive these; they are measured,
not inferred.

| Input | Current result |
| --- | --- |
| `[] ` at the start of a paragraph | `check_list > check_item{checked:false}` |
| `[x] ` / `[X] ` at the start of a paragraph | `check_list > check_item{checked:true}` |
| `[>] ` / `[v] ` | `toggle_list > toggle_item` |
| `- ` / `+ ` / `* ` then space | `bullet_list > list_item > paragraph` |
| `- ` then `[] foo` | **Nothing.** The text `[] foo` stays literal inside the bullet item. |
| `- ` then `[ ] foo` | **Nothing.** Literal text. |
| Markdown `- [ ] a`, `* [ ] a`, `+ [X] a` | Parses to `check_list > check_item` |
| Markdown `1. [ ] a` | Stays an `ordered_list`; the `[ ] ` is literal text |
| Markdown `- [ ] a\n  - [ ] b` | Nested `check_list` inside the outer `check_item` |
| Serializing any `check_item` | `- [ ] text` or `- [x] text` |
| Serializing a `bullet_list` | `* text` (asterisk, from `defaultMarkdownSerializer`) |

Why `- ` then `[] ` does nothing today: `checkListInputRule` in
`app/src/features/editor/schema.ts:750` deletes the marker and then calls
`findWrapping(range, checkList)`. Inside a `list_item` the block range's parent
is the `list_item`, whose content expression is `paragraph block*`. Wrapping the
item's only paragraph in a `check_list` would leave the `list_item` with no
leading paragraph, so `findWrapping` returns `null` and the rule declines. This
is the exact seam the new rule has to fill, and it is why a new rule is needed
rather than a regex widening.

### The two concepts today

There is already a checkbox/task distinction in the codebase, and it is **not**
the one the product sketch assumed:

- An ordinary checkbox is a `check_item` with `taskId === null` and
  `blockId === null`.
- A **task** is a `check_item` carrying both `taskId` and `blockId`, plus a
  durable `workspace_tasks` row keyed by that `taskId`.

`- [ ] x` and `[] x` currently produce **byte-identical** Markdown. Markdown
list syntax therefore cannot carry the distinction. The distinction is carried
by a trailing marker comment, `<!--skriuw-task:<taskId>[:<blockId>]-->`, emitted
only for linked items (`schema.ts:1175`).

## Product semantics

- **Checkbox** — `[] Remember this`. Document-local. Never appears in a task
  surface. Created by the existing paragraph-level `[] ` rule and by the
  existing `/check-list` slash command.
- **Task** — `- [ ] Do this`. A durable `WorkspaceTask` record linked to the
  checklist item it came from. Appears in a future `/tasks` surface. Created by
  the compound typing gesture, by the new `/task` slash command, and (later) by
  an explicit promote command on an existing checkbox.

Both render as a checkbox in the editor. The distinction lives in the data
model, not in visual noise.

## Non-goals

Listed in full under [Explicit non-goals](#explicit-non-goals). The two that
change the shape of the work: the `/tasks` view is not built here, and no task
metadata beyond title/status/source is exposed here.

---

## Repository findings

### Current checkbox implementation

- Nodes: `check_list` (`content: "check_item+"`, group `block`) and
  `check_item` (`content: "paragraph block*"`, `defining: true`), declared at
  `app/src/features/editor/schema.ts:378-423` and registered at `schema.ts:604`.
- `check_item` attrs: `checked` (default `false`), `taskId` (default `null`),
  `blockId` (default `null`).
- DOM: `li.check-item[data-checked]` with a `span.check-item-box`
  (`contenteditable="false"`, `role="checkbox"`, `aria-checked`). `taskId` and
  `blockId` round-trip through `data-task-id` / `data-block-id`, so they survive
  the HTML clipboard.
- Toggle: `createCheckboxTogglePlugin` (`schema.ts:857`) handles `mousedown` on
  `.check-item-box` only. **There is no keyboard path and no `tabindex`.** This
  is a pre-existing accessibility gap that this work must close.
- CSS: `app/src/features/editor/editor.css:77-130`.

### Current list implementation

Standard `prosemirror-schema-list` nodes added by `addListNodes` at
`schema.ts:597`. `bullet_list`, `ordered_list`, `list_item`. The bullet rule is
`wrappingInputRule(/^\s*([-+*])\s$/, bulletList)` at `schema.ts:1031`.

`Enter`, `Tab`, and `Shift-Tab` are chained across the three item types at
`schema.ts:1065-1081`:

```
Enter:      splitListItem(checkItem, {checked:false}) → splitListItem(toggleItem, {open:true}) → splitListItem(listItem)
Tab:        sinkListItem(checkItem) → sinkListItem(toggleItem) → sinkListItem(listItem) → goToNextCell(1)
Shift-Tab:  liftListItem(checkItem) → liftListItem(toggleItem) → liftListItem(listItem) → goToNextCell(-1)
```

**Measured**, not inferred: `splitListItem(checkItem, {checked:false})` applies
that attrs object to the *new* item, and attrs it omits fall back to their
schema defaults. Pressing Enter at the end of a populated
`check_item{taskId:"t1", blockId:"b1"}` today yields a new
`check_item{checked:false, taskId:null, blockId:null}`. There is no duplicate-id
bug here — the opposite: **task identity is not continued**, so Enter after a
task currently produces a plain checkbox. Fixing that is a product requirement
of this work (see [Enter](#enter)).

Two further measured Enter/Backspace facts:

- Enter in an *empty* `check_item` lifts the item out and appends a `paragraph`
  after the `check_list`. This already matches the desired "exit task context"
  behavior; no change needed.
- Backspace at the start of an empty single `check_item` turns the whole list
  into a `paragraph`. Also already correct; no task-specific casing needed.

### Input-rule order

`inputRules({rules: [...]})` at `schema.ts:1021-1051`, in order:

1. `smartQuotes`, `ellipsis`, `emDash`
2. `checkListInputRule()` — `/^\s*\[([ xX])?\]\s$/`
3. `toggleListInputRule()` — `/^\s*\[([>vV])\]\s$/`
4. heading — `/^(#{1,6})\s$/`
5. **bullet list — `/^\s*([-+*])\s$/`**
6. ordered list, blockquote, diagram, code block, horizontal rule, link,
   autolink, then the inline mark rules.

ProseMirror runs rules in array order and stops at the first that returns a
transaction. Rule 2 already precedes rule 5, and both match against the text of
the *current textblock only*. The new task rule must be inserted **before**
`checkListInputRule()` so that the in-list-item case is claimed before the
paragraph-level rule gets a chance; in practice the paragraph rule declines
inside a list item anyway, but explicit ordering makes the intent testable.

Critically: `- ` converts to a bullet immediately, in its own transaction, and
the `[] ` gesture arrives later as a separate transaction. **Do not attempt to
match `- [] ` as one regex** — by the time `[` is typed the `-` is gone from the
document.

### Current Markdown parser/serializer

Both live in `app/src/features/editor/schema.ts`.

Serializer (`productMarkdownSerializer`, `schema.ts:1129`):

```ts
check_list(state, node) { state.renderList(node, "  ", () => "- "); },
check_item(state, node) {
  state.write(node.attrs.checked ? "[x] " : "[ ] ");
  state.renderContent(node);
  if (isTaskId(node.attrs.taskId)) { /* writes <!--skriuw-task:…--> */ }
},
```

Parser: CommonMark has no task-list syntax, so `productMarkdownParser` yields a
plain `bullet_list`, and `upgradeSpecialLists` (`schema.ts:1668`) rewrites runs
of items whose first text child matches `CHECKBOX_PREFIX = /^\[([ xX])\] /`
into `check_list`/`check_item`, splitting mixed lists into adjacent runs.
`toCheckItem` (`schema.ts:1532`) strips the prefix and lifts the
`<!--skriuw-task:…-->` marker back into `taskId`/`blockId`.

Measured round-trip of a linked item:

```md
- [x] promoted task

   <!--skriuw-task:task_1:blk_1-->
```

The marker lands on its own line because `state.renderContent` closes the
paragraph before the marker is written. `toCheckItem` handles that shape
explicitly (the block-level marker branch at `schema.ts:1543-1559`), and the
round-trip restores `taskId` and `blockId` correctly. **It works, but the
output is ugly.** Tightening it to a same-line trailing marker is optional and
listed as a stretch item; if you change it, `toCheckItem` must keep accepting
both shapes or existing vaults lose their links.

`markdown-paste.ts` and the import adapters
(`app/src/features/transfer/import/sources/*`) all funnel through
`parseProductMarkdown`, so imported `- [ ] x` becomes an **unlinked** checkbox.
That is the desired behavior and must not change.

### Current block identity

- `check_item.taskId` and `check_item.blockId` are the only per-block
  identities in the schema. No generic block-id system exists.
- They are generated nowhere in the renderer today. `crypto.randomUUID()` is
  the repository's id factory (`app/src/store/actions/workspace.ts:71`).
- `app/src/store/actions/duplicate-note.ts:17` declares
  `BLOCK_IDENTITY_ATTRS = ["taskId", "blockId"]` and `withFreshBlockIds`
  regenerates both when a note is duplicated — the precedent for how copies
  must behave.
- `app/src/features/editor/task-promotion.ts` exposes
  `promoteSelectedChecklistItem` and `promotedChecklistTaskLinks`. **Neither
  has a single caller outside its own test.** It is a finished, tested seam
  waiting to be wired.

### Backend: already built

This is the finding that most changes the plan. The durable task model is
**complete and shipped** on the Rust and SQLite side:

- `crates/skriuw-domain/src/task.rs` — `WorkspaceTask`, `TaskStatus`
  (`todo`/`in_progress`/`done`), `TaskPriority`, `TaskSource {noteId, blockId}`,
  `TaskSourceDocument`, `document_task_links`, `unique_document_task_link`.
- `crates/skriuw-sqlite/migrations/0016_workspace_tasks.sql`.
- `crates/skriuw-sqlite/src/operations.rs` — handlers for `CreateTask`,
  `PromoteChecklistTask`, `UpdateTask`, `DeleteTask`, `DetachTask`;
  `reconcile_note_tasks` (line 1068) re-syncs linked task title/status/block on
  every `SaveDocument`; `detach_tasks` clears the link instead of deleting.
- `app/src/contracts/workspace.ts:115-139, 306-310` — generated TS mirrors:
  `TaskStatus`, `TaskPriority`, `TaskSource`, `WorkspaceTask`,
  `TaskSourceDocument`, and the five operation variants.
- `WorkspaceSnapshot.tasks?: WorkspaceTask[]` exists at
  `app/src/contracts/workspace.ts:176` and `:200`.
- `app/src/store/operations.ts:246-250` already routes the five task operation
  types to the backend.

What is **missing** is entirely renderer-side:

- `RendererState` has no `tasks` field (`app/src/store/types.ts:52-86`).
- `createInitialState` ignores `snapshot.tasks` (`app/src/store/store.ts:197`).
- No editor gesture, command, or UI creates a task.
- There is no `tasks` app route (`app/src/app-route.ts:3`).

### Current slash commands

`app/src/features/editor/slash-commands.tsx`. Shape:

```ts
export type SlashCommand = {
  id: string; label: string; subtext: string; group: string;
  aliases: readonly string[]; icon: ReactNode; command: Command;
  action?: SlashAction;
};
```

The existing entry (`slash-commands.tsx:171-179`):

```tsx
{
  id: "check-list", label: "Check list", subtext: "To-do list with checkboxes",
  group: "Lists", aliases: ["todo", "task", "checkbox", "checklist"],
  icon: <ListTodoIcon size={16} />, command: wrapInList(requiredNode("check_list")),
}
```

It already claims the aliases `todo` and `task`. Those must move to the new
command or `/task` will surface the wrong entry first.

### Performance contract

`docs/performance-contract.md`. The binding invariants for this work:

- Keystroke to paint: P95 below 8 ms, max below 16.67 ms.
- No IPC, database read, or Markdown parse during navigation.
- "No broad store subscription where a selector can express the dependency."
- "Editor keystroke → Editor-owned view only" render invariant.
- Git history and rebuildable projections stay off editing and navigation paths.

Consequence: the input rule may only produce a ProseMirror transaction. It must
not submit a workspace operation, touch the store, or await anything.

---

## Architecture decision

### Chosen Task representation

**Option D — keep the single `check_item` node; task identity is the existing
`taskId` + `blockId` attribute pair backed by a `workspace_tasks` row. Add no
new ProseMirror node and no new schema attribute.**

```
check_item { checked, taskId: null,   blockId: null   }   → checkbox
check_item { checked, taskId: "…",    blockId: "…"    }   → task
```

A task exists when, and only when, a `check_item` carries both well-formed ids
**and** a `workspace_tasks` row with that id exists. A dangling attribute is
inert by design (ADR 0031).

### Alternatives considered

**Option A — dedicated `task_item` / `task_list` node.** Rejected. It would
duplicate `check_item` byte-for-byte (same content expression, same checkbox
DOM, same `- [ ] ` Markdown), and every consumer would need a second branch:
`splitListItem`/`sinkListItem`/`liftListItem` chains, `upgradeSpecialLists`,
`toCheckItem`, `document_task_links` in Rust, `withFreshBlockIds`, the
serializer, the DOM parser, the bubble menu, and the import adapters. It would
also strand the shipped Rust `document_task_links`, which matches on
`type === "check_item"` only, forcing a backend change and a schema-version
bump for zero user-visible gain. It buys nothing that an attribute pair does not
already buy.

**Option B — `list_item { kind: "task" }`.** Rejected. `list_item` has no
`checked` attribute and no checkbox DOM; a task must render and toggle as a
checkbox. This would mean re-implementing `check_item` on `list_item`.

**Option C — `checkbox { task: true }`.** This is essentially the chosen design
minus the identity. Rejected in its literal form because a boolean cannot answer
"which task is this, and which block is it in?" — the two questions a `/tasks`
view exists to answer. The shipped `TaskSource {noteId, blockId}` pair already
encodes the answer; a boolean would have to be migrated to it later.

### Why this representation wins

- **It is already built.** Schema attrs, DOM round-trip, Markdown marker,
  Rust domain, SQLite migration, operations, sync, and archive v4 all ship
  today. Adding a node type would discard working, tested code.
- **Markdown round-trips as standard GFM.** A task is `- [x] text` plus an HTML
  comment. Every other Markdown editor renders it as a task list item and
  ignores the comment.
- **Imports cannot flood the task surface.** Because task-ness lives in the
  marker and not in the `- [ ]` syntax, importing a 4,000-line Obsidian vault
  full of `- [ ] ` lines yields 4,000 checkboxes and zero tasks. Under a design
  where `- [ ]` alone meant "task", the first import would turn the task view
  into landfill — the exact failure mode ADR 0031 was written to prevent.
- **Nesting, Enter, Tab, copy, and undo already work**, because a task is
  structurally a checklist item.
- **One source of truth.** The document owns the checklist item; the task record
  owns the metadata the document cannot express. `reconcile_note_tasks` already
  arbitrates: document text and checkbox win.

### The one place this contradicts the product sketch

The sketch asked that typing `- [ ] foo` *be* a task while `[] foo` is a
checkbox, with the two distinguished purely by Markdown list syntax. **That is
not achievable**, for a reason that is a property of the format rather than of
this codebase: `[] foo` already serializes to `- [ ] foo`. The two spellings
converge on one line of Markdown before anything else gets a vote.

The resolution keeps the requested *typing gesture* and drops only the
requested *Markdown encoding*:

- Typing `- ` then `[] ` (or `[ ] `) is a deliberate two-step gesture. It
  creates a task and stamps the identity marker. This is explicit user intent
  and satisfies ADR 0031.
- Typing `[] ` at a paragraph creates a checkbox. Unchanged.
- Reading `- [ ] foo` from a file, a paste, or an import creates a checkbox,
  because a file cannot express intent. Only the marker comment can.

This is a genuine amendment to ADR 0031, which says "Nothing promotes
implicitly." Ship it as **ADR 0032 — task-shaped typing is explicit intent**,
recording that a compound typing gesture counts as explicit while document shape
never does. Do not silently reinterpret 0031.

---

## Syntax

### Existing checkbox — unchanged

```
[] foo        → check_item{checked:false, taskId:null}
[x] foo       → check_item{checked:true,  taskId:null}
[X] foo       → check_item{checked:true,  taskId:null}
```

### Task shorthand

```
- [] foo      → check_item{checked:false, taskId:<new>, blockId:<new>}
```

### Standard Markdown

```
- [ ] foo     → check_item{checked:false, taskId:<new>, blockId:<new>}
```

`* [ ] ` and `+ [ ] ` are supported for free: the bullet rule at `schema.ts:1031`
accepts `[-+*]`, so all three produce the same `bullet_list` before the task
rule fires. The task rule never sees the bullet character.

### Completed tasks

```
- [x] foo     → check_item{checked:true, taskId:<new>, blockId:<new>}
- [X] foo     → check_item{checked:true, taskId:<new>, blockId:<new>}
```

### Not supported

```
1. [ ] foo    → ordered list with literal "[ ] foo" text (unchanged today)
```

Ordered task lists have no `check_list` equivalent and no Markdown spelling that
survives round-trip. Out of scope; do not add.

---

## Input-rule state transitions

```
paragraph
  └─ type "-" then space
       → bullet_list > list_item > paragraph          (existing rule, untouched)
          └─ type "[] " or "[ ] " or "[x] " or "[X] "
               → check_list > check_item{checked, taskId, blockId}   (new rule)
```

### Exact firing conditions

The new `taskInputRule()` fires only when **all** of the following hold:

1. The typed text matches `/^\[([ xX]?)\]\s$/` — the marker is the entire
   content of the current textblock. Leading whitespace is **not** tolerated
   (unlike `checkListInputRule`), because inside a list item there is none.
2. The paragraph is empty apart from the marker being deleted — i.e. the match
   starts at position 0 of the textblock and the textblock has no other content.
3. The paragraph is the **first child** of its parent, and that parent is a
   `list_item`.
4. The `list_item` has exactly one child (the paragraph). An item that already
   has nested blocks is not a "fresh" item.
5. The `list_item`'s parent is a `bullet_list`, and that `bullet_list`'s parent
   is the `doc`.
6. The parent textblock is not `code`
   (`state.doc.resolve(start).parent.type.spec.code`), matching every other rule
   in the file.

Condition 5 scopes v1 to top-level bullets. Typing `[] ` inside a *nested*
bullet item leaves the text literal — exactly what happens today, so it is not a
regression. Nested tasks remain reachable: create the task at top level, then
press `Tab`, which already runs `sinkListItem(checkItem)`. Nested `check_list`
structures parse and serialize correctly (verified).

### Rejected inputs (must stay literal text)

```
- hello []          condition 1 fails (marker is not the whole textblock)
- hello [] world    condition 1 fails
- hello
  [] nested         condition 3/4 fails (paragraph is not the first child)
- [] (inside a nested bullet)   condition 5 fails
[] inside a code block          condition 6 fails
```

### Transformation

After `tr.delete(start, end)` removes the marker:

1. Lift the now-empty paragraph out of the `bullet_list`. Use
   `liftListItem(listItem)` from `prosemirror-schema-list` against the
   transaction's state — it already handles splitting the surrounding list when
   the item is in the middle, which is why adjacent bullets survive.
2. Resolve the lifted paragraph's `blockRange()` and `findWrapping(range,
   checkList)`, then `tr.wrap(range, wrapping)`.
3. `tr.setNodeMarkup(itemPos, undefined, { checked, taskId, blockId })` where
   `checked` is `match[1]?.toLowerCase() === "x"`.

Alternative for the single-item case: when the `bullet_list` has exactly one
child, `setNodeMarkup` the `bullet_list` to `check_list` and the `list_item` to
`check_item` directly. Both node types accept `paragraph block*`, so the
existing content stays valid. This is cheaper; use it if the lift path proves
awkward, but the lift path handles every case uniformly.

Id generation: `crypto.randomUUID()` for both, matching
`app/src/store/actions/workspace.ts:71`. The two ids must differ —
`document_task_links` in Rust rejects `task_id == block_id`
(`crates/skriuw-domain/src/task.rs:293`), as does the TS validator in
`task-promotion.ts`.

Both ids must satisfy `/^[A-Za-z0-9_-]{1,128}$/`. `crypto.randomUUID()` output
does.

### Undo

One `tr.delete` + structural change in a single transaction means one undo step
returns the document to `- ` with the literal marker text, matching how
`checkListInputRule` behaves today. `prosemirror-inputrules` also installs its
own `undoInputRule`, but that is not bound in this repository's keymap, so
plain `Mod-z` is the only path and it is sufficient.

---

## ProseMirror/schema changes

**None to the node specs.** `check_item` already carries `taskId` and `blockId`.

Changes inside `app/src/features/editor/schema.ts`:

1. Add `taskInputRule()` and register it **before** `checkListInputRule()` in
   the `inputRules` array at `schema.ts:1026`.
2. Replace the `Enter` binding at `schema.ts:1066`. `splitListItem(checkItem,
   { checked: false })` already leaves the new item's `taskId`/`blockId` at
   their `null` defaults (measured), so Enter after a task currently degrades it
   to a plain checkbox. Substitute a command that, when the split occurs inside
   a `check_item` whose `taskId` is non-null, assigns the new item **fresh,
   distinct** `taskId` and `blockId`; when the source item is a plain checkbox,
   leaves both `null`. Never copy the source ids — two items sharing one
   `taskId` is the ambiguous state ADR 0031's Consequences section calls out.
   Keep it to a single dispatch so `Mod-z` undoes the continuation in one step.
3. Extend `createCheckboxTogglePlugin` so the toggle is keyboard-reachable, and
   preserve `taskId`/`blockId` when toggling. The current handler calls
   `setNodeMarkup(pos, undefined, { checked: !checked })`, which **drops
   `taskId` and `blockId`** because it replaces the whole attrs object. Fixing
   this is mandatory: today's toggle would silently unlink a task. Spread the
   existing attrs.
4. Export a `promoteCheckItemAtSelection` command (or extend
   `task-promotion.ts`) so `/task` and a future palette command share one path.

---

## Markdown parsing

No parser change is required for v1. `upgradeSpecialLists` already:

- accepts `-`, `*`, `+` bullets with `[ ]`, `[x]`, `[X]`;
- splits mixed bullet/checkbox runs into adjacent lists;
- handles nested `check_list`s;
- lifts `<!--skriuw-task:id[:blockId]-->` back into `taskId`/`blockId` from
  either the same line or a following marker-only paragraph.

Explicitly **do not** make the parser assign task identity to unmarked
`- [ ] ` lines. Imported and pasted checklists must arrive as checkboxes.

## Markdown serialization

Linked items serialize their marker on the same line as their visible text.

```md
- [ ] Open task <!--skriuw-task:…-->     (open, linked)
- [x] Done task <!--skriuw-task:…-->     (completed, linked)
- [ ] Just a checkbox                    (unlinked)
```

The serializer emits a marker only when the linked item has non-empty text.
It must not clean up ids by mutating the document on the save path. `toCheckItem`
continues to accept the existing marker-only paragraph shape.

---

## Editor behavior

### Enter

- **Enter in a non-empty task creates another task.** The new item gets **fresh,
  distinct** `taskId` and `blockId` — never a copy of the source ids, which
  would produce two links to one record. Typing `- [ ] a` ⏎ `b` ⏎ `c` therefore
  yields three tasks, which is the point of the gesture: the user opted into a
  task list, not into promoting one line.

  Today's binding does the opposite (measured): the new item comes out with
  `taskId: null`, i.e. a plain checkbox. That is the defect the `Enter` change
  fixes.

  Trade-off, stated so it can be revisited without re-deriving it: continuing
  identity means a burst of Enter presses can create several empty tasks. Empty
  items are harmless — `promotedChecklistTaskLinks` requires a non-empty title
  before a link is emitted (`task-promotion.ts`, `checklistTaskTitle`), and
  `document_task_links` in `crates/skriuw-domain/src/task.rs` enforces the same
  rule. An empty trailing task never reaches `workspace_tasks`.

- **Enter in an empty task exits task context.** Measured current behavior: the
  item lifts out of the list and a `paragraph` is appended after the
  `check_list`. This already matches the desired UX. Unchanged.
- Enter in a non-empty **plain checkbox** still produces a plain checkbox
  (`taskId: null`). Unchanged.

### Backspace

Unchanged — `baseKeymap`'s `joinBackward` / `liftEmptyBlock` chain already
handles it. Measured: Backspace at the start of an empty single `check_item`
turns the whole list into a `paragraph`. Do not add a
custom binding. If the item carried a `taskId`, the item's disappearance is
detected on the next save by `reconcile_note_tasks`, which **detaches** the task
rather than deleting it (ADR 0031). That is intended: deleting the line does not
destroy the work item.

### Tab / Shift+Tab

Unchanged. `sinkListItem(checkItem)` and `liftListItem(checkItem)` are already
bound and already precede the plain-list variants in the chain. Nested tasks
serialize and parse correctly (verified). Nesting is supported for v1 as a
consequence of reusing `check_item`; no new work.

### Toggle

- Clicking `.check-item-box` toggles — existing behavior, but the handler must
  be fixed to preserve `taskId`/`blockId` (see schema change 3).
- Keyboard: add `tabindex="0"` to the `check-item-box` span in `toDOM` and
  handle `Enter`/`Space` in `createCheckboxTogglePlugin`'s `handleKeyDown`,
  mirroring `createToggleListPlugin` (`schema.ts:966-977`), which already does
  exactly this for the disclosure button. Reuse that shape.
- Add an editor-bound shortcut so the checkbox can be toggled with the caret
  inside the item without reaching the box. Follow
  `app/src/features/editor/editor-bound-shortcut-ids.ts` and honour the 60%
  keyboard constraint: no Home/End/PageUp/PageDown, and provide a
  `Shift`+arrow alias if you use an arrow.
- Every toggle is one `setNodeMarkup` transaction, so it is undoable and
  redoable for free.
- Completion persists through the ordinary `save_document` path;
  `reconcile_note_tasks` maps `checked` to `done` and unchecking back to `todo`
  without discarding an `in_progress` state the checkbox cannot express.

No timestamps or extra metadata on completion in v1. `updated_at` is already
stamped by the backend.

### Undo/redo

Nothing special. Every change above is a single transaction inside the existing
`history({ newGroupDelay: 500, depth: 200 })` plugin.

---

## Slash-menu integration

In `app/src/features/editor/slash-commands.tsx`:

1. Narrow the existing entry — remove `"todo"` and `"task"` from `check-list`'s
   aliases, leaving `["checkbox", "checklist"]`. Consider retitling its
   `subtext` to make the distinction legible, e.g. "Document-local checkboxes".
2. Add, immediately after `check-list`:

```tsx
{
  id: "task",
  label: "Task",
  subtext: "Actionable item tracked across the workspace",
  group: "Lists",
  aliases: ["todo", "task"],
  icon: <ListTodoIcon size={16} />,
  command: insertTask,
}
```

`insertTask` must produce the same node shape the input rule produces: a
`check_list` containing one `check_item` with fresh `taskId`/`blockId`. Do not
reuse `wrapInList(check_list)` unmodified — it would create an unlinked
checkbox. Implement it as `wrapInList` followed by `setNodeMarkup` on the
resulting item, or share the transform helper with the input rule.

Use a distinct icon if one reads clearly in `@/shared/icons/static`; otherwise
keep `ListTodoIcon` for both rather than inventing visual noise.

---

## Stable identity and source navigation

The `/tasks` view's four questions, and where each is answered today:

| Question | Answer |
| --- | --- |
| Which task is this? | `WorkspaceTask.id`, mirrored in `check_item.taskId` |
| What does it say? | `WorkspaceTask.title`, reconciled from the item's paragraph on every save |
| Is it done? | `WorkspaceTask.status`, reconciled from `checked` |
| Which note? | `WorkspaceTask.source.noteId` |
| Which block? | `WorkspaceTask.source.blockId` = `check_item.blockId` |

Navigating back to the exact source block: resolve `source.noteId` →
`store.setActiveNote(noteId)`, then scan the loaded document for the
`check_item` whose `blockId` matches and select it. Follow the pattern in
`app/src/features/references/reference-navigation.ts`, which pushes the current
location onto a back stack before jumping. Reveal with
`view.dispatch(tr.setSelection(...).scrollIntoView())`, as
`note-editor.tsx:929` already does for document edges.

Identity must be introduced now — it is the only thing distinguishing a task
from a checkbox, so there is no version of this feature that defers it.

---

## Persistence

**No new table, no migration, no new operation type.** Everything needed exists.

The flow:

```
input rule / slash command      → document only, synchronous, no IPC
   check_item gains taskId + blockId

user types the task title       → document only

idle (after paint) reconciler   → promote_checklist_task operation
   { task: WorkspaceTask, document: TaskSourceDocument }   ← one atomic transaction

subsequent edits                → save_document
   reconcile_note_tasks re-syncs title, status, block id
```

### The promotion reconciler

Why it cannot happen in the input rule: the performance contract forbids IPC on
the keystroke path, and `PromoteChecklistTask` must carry the *whole* document
so the backend can re-prove the link in the same transaction.

Why it cannot happen immediately even off-thread: `document_task_links`
(`crates/skriuw-domain/src/task.rs:250`) and its TS twin both **require a
non-empty title**. A freshly created task has no text yet. Promotion must wait
until the item has a title.

Design:

- A renderer module (suggested: `app/src/features/editor/task-linking.ts`)
  reads the current document after paint — reuse the existing debounce that
  drives `persistCurrentDocument` in `note-editor.tsx:546` rather than adding a
  second timer.
- It calls `promotedChecklistTaskLinks(document, noteId, at)` from the existing
  `task-promotion.ts`.
- For every link whose `taskId` is absent from `state.tasks`, it submits one
  `promote_checklist_task` operation carrying a freshly built `WorkspaceTask`
  (`status` from `checked`, `priority: "medium"`, empty description, empty tag
  and assignee arrays, `source: {noteId, blockId}`, `detachedAt: null`) and the
  `TaskSourceDocument` for the same note.
- Links whose ids already have records are left alone; `save_document` already
  reconciles them.
- Failure leaves the attributes in place and inert; retry on the next pass.
  Surface a failure the way the sync recovery UI does rather than swallowing it.

### Renderer store slice

Add to `RendererState` (`app/src/store/types.ts`):

```ts
tasks: ReadonlyMap<string, WorkspaceTask>;
```

- Hydrate from `snapshot.tasks ?? []` in `createInitialState`
  (`app/src/store/store.ts:197`), following the `images` and `properties`
  patterns at `store.ts:238-242`.
- Apply the five task operations in the store's operation reducer so optimistic
  state matches what the backend will do.
- Handle detachment: `save_document` on a note whose link disappeared clears
  `source` and stamps `detachedAt` server-side; mirror that locally.
- Keep subscriptions narrow — a task-count badge must select the count, not the
  map.

---

## Future Task projection / `/tasks`

Not built here. What v1 must leave in place so it is a small, additive change:

- `RendererState.tasks` is the projection. It is hydrated from SQLite at
  startup and kept current by operations — it is not recomputed by scanning
  documents. Workspace-wide document scans on edit are forbidden by the
  performance contract.
- Add `"tasks"` to `AppRoute` in `app/src/app-route.ts:3` and a `#/tasks` case
  in `resolveAppRoute`, following the `journal` and `tags` entries.
- The view groups tasks by `source.noteId` (resolving the note title through
  `state.nodes`), renders detached tasks (`source === null`) in their own group,
  toggles completion by submitting `update_task` **with** the rewritten source
  document — omitting the document means the next `save_document` reconciles the
  change away, per ADR 0031's Consequences.
- It updates instantly when the source is edited because the same store slice
  backs both.

---

## Performance requirements

Bound by `docs/performance-contract.md`.

- The input rule performs one synchronous transaction. No store read, no IPC,
  no `Date.now()`-driven scheduling, no await.
- `crypto.randomUUID()` twice per gesture is negligible and is only called on
  the rule's success path — compute ids after all guard conditions pass.
- The promotion reconciler runs after paint, on the existing save debounce, and
  scans **one document** — never the workspace.
- `promotedChecklistTaskLinks` walks the document with `descendants`; on the
  2,000-block fixture this must stay off the keystroke path. It already will be,
  because it runs on the save path.
- Adding `tasks` to `RendererState` must not widen any existing subscription.
  Components read it through a selector.
- No editor remount, no application-shell render from a task keystroke.

If you touch the save path, re-measure keystroke-to-paint against the
2,000-block fixture and record it under `docs/benchmarks/`.

---

## Accessibility

- Keep `role="checkbox"` and `aria-checked` on `.check-item-box`; they are
  already correct.
- Add `tabindex="0"` so the box is reachable by plain Tab, and handle
  `Enter`/`Space` in the plugin — copy the `handleKeyDown` shape from
  `createToggleListPlugin` (`schema.ts:966`).
- Add an `aria-keyshortcuts` attribute naming the toggle shortcut, matching how
  `toggleItemSpec` advertises `Alt+Enter` (`schema.ts:454`).
- The box stays `contenteditable="false"`.
- The editing caret path must not require the mouse: the editor-bound toggle
  shortcut works with the caret anywhere inside the item.
- Honour the 60% keyboard constraint recorded in this repository's conventions:
  no Home/End/PageUp/PageDown-only bindings.
- A task and a checkbox are announced identically in v1. If a screen-reader
  distinction is wanted later, add it to the label, not to a second node type.

---

## Migration/backward compatibility

- No SQLite migration. `0016_workspace_tasks.sql` is already applied.
- No schema version bump; no new node or attribute.
- No contract regeneration — `WorkspaceTask` and the five operations are already
  in `app/src/contracts/workspace.ts` and `contracts/generated/*.json`. If you
  find yourself running `scripts/generate.sh`, you have added something the
  design says you should not have.
- Existing notes: unaffected. Every existing `check_item` has
  `taskId: null` and stays a checkbox.
- Existing vaults containing `- [ ] ` Markdown: unaffected, still checkboxes.
- Archive v4 already carries tasks.
- The `splitListItem` and toggle-handler attr fixes are strictly bug fixes; they
  cannot regress existing documents, which have `null` in both attrs.

---

## Files expected to change

| File | Why | Responsibility |
| --- | --- | --- |
| `app/src/features/editor/schema.ts` | `taskInputRule()`, rule registration, `splitListItem` attr reset, toggle-handler attr preservation, keyboard toggle, `tabindex` in `checkItemSpec.toDOM` | All ProseMirror structure and input handling. No store or IPC code here. |
| `app/src/features/editor/task-promotion.ts` | Add the shared "make this check_item a task" transform used by both the input rule and `/task`; keep the existing exports | Pure document transforms and link extraction. Already framework-free — keep it that way. |
| `app/src/features/editor/slash-commands.tsx` | Add `/task`; narrow `check-list` aliases | Slash-menu vocabulary only. |
| `app/src/features/editor/task-linking.ts` *(new)* | Idle reconciler that turns unpromoted links into `promote_checklist_task` operations | The only place that bridges document → workspace operation. Keeps IPC out of `schema.ts`. |
| `app/src/features/editor/note-editor.tsx` | Call the reconciler from the existing save debounce (`persistCurrentDocument`, line 546) | Wiring only; no task logic here. |
| `app/src/store/types.ts` | `tasks: ReadonlyMap<string, WorkspaceTask>` on `RendererState` | State shape. |
| `app/src/store/store.ts` | Hydrate `snapshot.tasks`; apply the five task operations | Renderer projection of canonical state. |
| `app/src/features/editor/editor.css` | Focus ring for the now-focusable `.check-item-box` | Visual only. Do not add task-specific chrome in v1. |
| `app/src/features/editor/editor-bound-shortcut-ids.ts` | Register the toggle shortcut id | Shortcut registry. |
| `app/__tests__/features/editor/tasks.test.ts` *(new)* | Input rule, transitions, false positives, Enter/Tab, serialization | Mirrors `src/` per the repository's test-layout convention. |
| `app/__tests__/features/editor/check-list.test.ts` | Add regression assertions that `[] ` still produces an **unlinked** item | Guards the checkbox. |
| `docs/adr/0032-task-shaped-typing-is-explicit.md` *(new)* | Amend ADR 0031's "nothing promotes implicitly" for the typing gesture | Durable reasoning. |
| `docs/FEATURES.md` | Document the checkbox/task distinction | User-facing feature list. |

Do **not** change: any file under `crates/`, any file under
`contracts/generated/`, `app/src/contracts/workspace.ts`, or any import adapter
under `app/src/features/transfer/`.

---

## Implementation order

1. Read `docs/adr/0031-explicit-task-promotion.md` and
   `docs/specs/task-promotion.md`. They are short and they are binding.
2. Land the two pre-existing bugs first, with tests, so they are reviewable
   separately: `splitListItem` attr reset, and attr preservation in
   `createCheckboxTogglePlugin`.
3. Add `taskInputRule()` and its tests. Editor-only; nothing durable yet.
4. Add the shared task transform and wire `/task` to it.
5. Add keyboard toggle, `tabindex`, focus styling, and the editor-bound
   shortcut.
6. Add `RendererState.tasks`, hydration, and operation application.
7. Add `task-linking.ts` and call it from the save debounce.
8. Write ADR 0032 and update `docs/FEATURES.md`.
9. Run `./scripts/check.sh`.

Steps 1–5 are shippable without 6–7; the document carries the intent and the
records materialize once the store slice lands.

---

## TODO checklist

### Editor structure

- [ ] Fix `Enter`: replace `splitListItem(checkItem, { checked: false })` at
      `app/src/features/editor/schema.ts:1066` with a command that continues task
      identity — splitting a `check_item` with a non-null `taskId` gives the new
      item **fresh, distinct** `taskId`/`blockId`; splitting a plain checkbox
      leaves both `null`. Never copy the source ids. Single dispatch, so `Mod-z`
      undoes it in one step.
- [ ] Fix toggle: in `createCheckboxTogglePlugin` (`schema.ts:876`), spread the
      existing attrs into `setNodeMarkup` instead of passing
      `{ checked: !node.attrs.checked }` alone, which currently drops
      `taskId`/`blockId`.
- [ ] Add `taskInputRule()` to `schema.ts` matching `/^\[([ xX]?)\]\s$/` under
      the six firing conditions in
      [Input-rule state transitions](#input-rule-state-transitions).
- [ ] Register `taskInputRule()` immediately before `checkListInputRule()` in
      the `inputRules` array at `schema.ts:1026`.
- [ ] Generate `taskId` and `blockId` with `crypto.randomUUID()` on the rule's
      success path only, asserting they differ.
- [ ] Leave `checkListInputRule`, `toggleListInputRule`, and the bullet
      `wrappingInputRule` byte-for-byte unchanged.

### Shared transform

- [ ] Add a `taskCheckItemAttrs(checked)` / `insertTaskTransform(state)` helper
      in `app/src/features/editor/task-promotion.ts` used by both the input rule
      and the slash command, so there is one definition of "a task-shaped
      `check_item`".

### Slash menu

- [ ] Remove `"todo"` and `"task"` from the `check-list` entry's aliases in
      `app/src/features/editor/slash-commands.tsx:176`.
- [ ] Add a `task` slash command (`aliases: ["todo", "task"]`, group `"Lists"`)
      whose `command` produces a `check_list > check_item` carrying fresh
      `taskId`/`blockId` — not bare `wrapInList(check_list)`.
- [ ] Keep the `check-list` command creating unlinked checkboxes.

### Accessibility

- [ ] Add `tabindex: "0"` to the `check-item-box` span in `checkItemSpec.toDOM`
      (`schema.ts:393-411`).
- [ ] Handle `Enter` and `Space` in `createCheckboxTogglePlugin` via
      `handleKeyDown`, mirroring `createToggleListPlugin` (`schema.ts:966`).
- [ ] Add an editor-bound shortcut id for toggling the checkbox at the caret,
      registered in `editor-bound-shortcut-ids.ts`, with no
      Home/End/PageUp/PageDown dependency.
- [ ] Add `aria-keyshortcuts` to the box naming that shortcut.
- [ ] Add a visible focus ring for `.check-item-box:focus-visible` in
      `editor.css`.

### Store

- [ ] Add `tasks: ReadonlyMap<string, WorkspaceTask>` to `RendererState` in
      `app/src/store/types.ts`.
- [ ] Hydrate it from `snapshot.tasks ?? []` in `createInitialState`
      (`app/src/store/store.ts:197`), following the `images` pattern.
- [ ] Apply `create_task`, `update_task`, `delete_task`, `detach_task`, and
      `promote_checklist_task` to the local map so optimistic state matches the
      backend.
- [ ] Mirror backend detachment: when a saved document no longer links a task,
      clear its `source` and stamp `detachedAt` locally.

### Promotion

- [ ] Add `app/src/features/editor/task-linking.ts` that calls
      `promotedChecklistTaskLinks(document, noteId, at)` and returns the links
      whose `taskId` has no record in `state.tasks`.
- [ ] Submit one `promote_checklist_task` operation per unrecorded link,
      carrying both the `WorkspaceTask` and the `TaskSourceDocument` for the
      same note, so the backend writes both halves in one transaction.
- [ ] Default new tasks to `priority: "medium"`, empty `description`, empty
      `tagIds`/`assigneeIds`, `detachedAt: null`, `status` from `checked`.
- [ ] Invoke the reconciler from the existing save debounce in
      `persistCurrentDocument` (`note-editor.tsx:546`) — do not add a second
      timer and do not call it from a ProseMirror transaction.
- [ ] Skip links with an empty title; `document_task_links` and
      `validate_title` both reject them.
- [ ] On failure, leave the attributes in place, surface the error, and retry on
      the next pass. Never silently swallow it.

### Copy/paste

- [ ] Regenerate `taskId`/`blockId` on `check_item` nodes arriving through
      `handlePaste`, reusing the `withFreshBlockIds` approach in
      `app/src/store/actions/duplicate-note.ts:31`, so pasting a task creates a
      new task instead of a second link to the existing one.
- [ ] Leave `markdown-paste.ts` alone — pasted `- [ ] ` Markdown must remain an
      unlinked checkbox.

### Documentation

- [ ] Write `docs/adr/0032-task-shaped-typing-is-explicit.md` amending ADR
      0031's "nothing promotes implicitly" to admit the compound typing gesture,
      and restating that document shape alone still never promotes.
- [ ] Update `docs/FEATURES.md` with the checkbox-versus-task distinction.
- [ ] Add a cross-reference from `docs/specs/task-promotion.md` to this file.

---

## Test plan

New file `app/__tests__/features/tasks/tasks.test.ts` (or
`app/__tests__/features/editor/tasks.test.ts` to sit beside the editor tests).
Reuse the `stateWithText` / `typeText` harness from
`app/__tests__/features/editor/check-list.test.ts:11-42` — note that its
`typeText` feeds the whole string at once; the task tests need per-character
feeding so `- ` fires before `[] ` is seen.

### Regression — existing behavior

- [ ] `[] foo` still produces `check_item{checked:false, taskId:null, blockId:null}`.
- [ ] `[x] foo` and `[X] foo` still produce `checked:true` with null identity.
- [ ] `- foo` still produces `bullet_list > list_item`.
- [ ] `[>] ` and `[v] ` still produce toggle lists.
- [ ] Every existing assertion in `check-list.test.ts` and
      `task-promotion.test.ts` passes unmodified.

### Task creation

- [ ] `- ` then `[] foo` produces one `check_list > check_item` with
      `checked:false` and two distinct non-empty ids.
- [ ] `- ` then `[ ] foo` produces the same shape.
- [ ] `- ` then `[x] foo` and `- ` then `[X] foo` produce `checked:true`.
- [ ] `* ` and `+ ` bullets reach the same result.
- [ ] `taskId !== blockId`, and both match `/^[A-Za-z0-9_-]{1,128}$/`.
- [ ] Two consecutive tasks receive distinct `taskId`s.

### False positives

- [ ] `- foo []` stays literal text in a `list_item`.
- [ ] `- foo [] bar` stays literal.
- [ ] `- foo`, Enter, then a nested paragraph starting `[] ` does not promote.
- [ ] `[] ` typed inside a nested bullet item stays literal (documented v1 scope).
- [ ] `[] ` inside a code block stays literal.
- [ ] `1. ` then `[] foo` stays literal in an `ordered_list`.

### Adjacent content

- [ ] Given `- alpha`, Enter, `[] beta`: `alpha` remains a bullet and `beta`
      becomes a task in a sibling `check_list`.
- [ ] Given three bullets, promoting the middle one leaves the first and third
      as bullets and produces three sibling lists in document order.

### Editing

- [ ] Enter at the end of a populated task creates a new task whose `taskId` and
      `blockId` are non-null and **differ from the source item's**.
- [ ] Enter at the end of a populated plain checkbox creates a plain checkbox
      (`taskId:null`, `blockId:null`).
- [ ] Enter on an empty task exits the list into a paragraph after the
      `check_list`.
- [ ] Backspace at the start of an empty task turns the list into a paragraph.
- [ ] `Tab` nests a task under the preceding item; `Shift-Tab` lifts it back.
- [ ] Toggling `checked` preserves `taskId` and `blockId`.

### Toggle and accessibility

- [ ] Clicking `.check-item-box` toggles `checked` and preserves both ids.
- [ ] `Enter` and `Space` on a focused `.check-item-box` toggle `checked`.
- [ ] The rendered `li` exposes `role="checkbox"`, `aria-checked`, and
      `tabindex="0"` on the box.
- [ ] The editor-bound toggle shortcut toggles with the caret inside the item.

### Undo/redo

- [ ] One `Mod-z` after the promotion gesture restores the bullet item with the
      literal marker text.
- [ ] Redo restores the task, ids included.
- [ ] Undo after a toggle restores the previous `checked` value and both ids.

### Markdown

- [ ] An unlinked `check_item` serializes to `- [ ] text` with no marker.
- [ ] A linked open task serializes to `- [ ] text` plus
      `<!--skriuw-task:…-->`.
- [ ] A linked completed task serializes to `- [x] text` plus the marker.
- [ ] Parsing `- [ ] a`, `* [ ] a`, `+ [X] a` yields unlinked `check_item`s.
- [ ] Parsing a serialized linked task restores `taskId` and `blockId`
      (already covered by `task-promotion.test.ts:161` — keep it green).
- [ ] Nested `- [ ] a\n  - [ ] b` round-trips through parse → serialize → parse.
- [ ] A mixed list `- plain\n- [ ] box\n- plain` splits into three adjacent
      lists (existing `check-list.test.ts:114`).

### Copy/paste

- [ ] Copying a task and pasting it into the same note yields two `check_item`s
      with **different** `taskId`s.
- [ ] Copying a task as plain Markdown yields `- [x] text <!--skriuw-task:…-->`.
- [ ] Pasting `- [ ] foo` Markdown from outside Skriuw yields an unlinked
      checkbox.
- [ ] Duplicating a note regenerates both ids (existing behavior in
      `duplicate-note.ts`; add an assertion if none exists).

### Slash menu

- [ ] `/task` and `/todo` surface the Task command first.
- [ ] `/checkbox` and `/checklist` surface the Check list command.
- [ ] The Task command produces a `check_item` with fresh ids.
- [ ] The Check list command produces a `check_item` with null ids.

### Store and identity

- [ ] `RendererState.tasks` hydrates from `snapshot.tasks`.
- [ ] `promote_checklist_task` inserts into the local map.
- [ ] `promotedChecklistTaskLinks` on a document with one task and three
      checkboxes returns exactly one link.
- [ ] The reconciler submits nothing for a link whose task already exists.
- [ ] The reconciler submits nothing for a link whose title is empty.
- [ ] Given a task's `blockId`, the source `check_item` can be located in the
      note's document — the resolution a `/tasks` view will need.

### Rust

- [ ] Existing `crates/skriuw-domain` and `crates/skriuw-sqlite` task tests stay
      green. No Rust change is expected; if you needed one, revisit the design.

---

## Acceptance criteria

1. Typing `[] foo` at a paragraph produces an ordinary checkbox with null
   `taskId`/`blockId`, exactly as before.
2. Typing `- `, `* `, or `+ ` followed by a space produces an ordinary bullet
   list item, exactly as before.
3. Typing `- ` then `[] ` produces a first-class task.
4. Typing `- ` then `[ ] ` produces the identical first-class task.
5. Typing `- ` then `[x] ` or `[X] ` produces a completed first-class task.
6. Checkboxes and tasks stay semantically distinct: only items carrying both
   ids enter `promotedChecklistTaskLinks` and `document_task_links`.
7. Tasks round-trip through `- [ ]` / `- [x]` Markdown, with identity carried by
   the `<!--skriuw-task:…-->` marker; unmarked Markdown parses to checkboxes.
8. No false positives: `- foo []`, nested `[] ` paragraphs, ordered-list items,
   and code blocks stay literal text.
9. Enter, Backspace, Tab, and Shift-Tab behave consistently with the existing
   checklist UX, and Enter never duplicates a `taskId`.
10. `/task` creates the same representation the typing gesture creates.
11. Toggling is mouse-reachable, keyboard-reachable, screen-reader-labelled, and
    undoable, and never drops `taskId`/`blockId`.
12. A task's `source.noteId` + `source.blockId` resolve to its exact source
    `check_item`, so a future `/tasks` view can navigate to it.
13. No new table, migration, node type, schema attribute, or generated contract
    is introduced.
14. Keystroke-to-paint stays within `docs/performance-contract.md`; no IPC,
    database read, or workspace scan runs on the editing path.
15. `app/__tests__/features/editor/check-list.test.ts` and
    `task-promotion.test.ts` pass unmodified.
16. New tests cover input rules, false positives, editing, toggling, copy/paste,
    slash commands, serialization, and store application.
17. `./scripts/check.sh` passes.

---

## Explicit non-goals

- The `/tasks` workspace view. The route, grouping, and toggling UI are a
  separate change; v1 only guarantees the data model supports them.
- Due dates, priority editing, recurrence, assignees, tags, and descriptions in
  the editor. The fields exist on `WorkspaceTask`; nothing exposes them yet.
- `in_progress` status from the editor. A checkbox has two states; the third
  arrives with the task surface.
- Ordered-list tasks (`1. [ ] x`).
- Task-specific visual chrome — cards, badges, colored statuses, Kanban,
  metadata chips. A task looks like a checkbox in v1.
- Promoting an existing checkbox in place via a command or bubble-menu button.
  `promoteSelectedChecklistItem` already supports it; exposing it is follow-up.
- Changing how `[] ` or `- ` behave.
- Any Rust, contract, or migration change.

---
