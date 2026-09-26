# Block drag handles

The newest feature and the least exercised. Hovering any block shows a gutter
in the left margin with a plus button and a drag grip.

Reordering runs on pointer events rather than HTML5 drag and drop, because
dragging page content does not work in the desktop webview. So this behaves the
same on desktop and in a browser — test both if you can.

## Numbered blocks

Reorder these and check they end up where you dropped them.

1. Block one — a plain paragraph
2. Block two — a plain paragraph
3. Block three — a plain paragraph
4. Block four — a plain paragraph
5. Block five — a plain paragraph

## Mixed block types

Each of these should get a handle, and each should survive being moved.

## A heading

> A blockquote to drag

- A list, which moves as a whole
- Not as individual items

```ts
const codeBlock = "drag me too";
```

| A table | to drag |
| --- | --- |
| one | two |

---

A paragraph after the divider.

## The gutter

- The handle tracks the block under the pointer
- It aligns to the block's **first line**, not its middle — check against the
  tall code block and the table
- Moving toward the handle does not make it vanish
- It disappears on scroll and comes back on the next mouse move
- It disappears while typing, which is deliberate: a stale position would grab
  the wrong block

## Dragging

- Press the grip and move: a line shows where the block will land
- Release: the block moves there
- Dropping a block back where it started changes nothing
- `Escape` mid-drag cancels
- Dragging near the top or bottom edge auto-scrolls
- Undo restores the previous order in one step

## The plus button

Inserts an empty paragraph below and opens the slash menu in it.

## Clicking the grip

Selects the block and opens a menu: Duplicate, Move up, Move down, Delete.

- Duplicate puts the copy directly below
- Delete on the only block in a note leaves an empty paragraph rather than an
  invalid document
- Move up on the first block does nothing, likewise Move down on the last

The menu is mouse-only right now; there is no keyboard route to Duplicate or
Delete. Known gap.

## Keyboard reordering

`Alt-ArrowUp` and `Alt-ArrowDown` move the block containing the cursor. This
works everywhere the drag does, and it is the only keyboard path to reordering.

The cursor should stay in the block that moved.

## Checklist

- [ ] Handle appears on every block type and aligns to the first line
- [ ] Drag, drop indicator, and release all behave
- [ ] `Escape` cancels, auto-scroll works, undo is one step
- [ ] Plus button inserts and opens the slash menu
- [ ] Duplicate, Move up, Move down, Delete all work
- [ ] Delete on a single-block note leaves a paragraph
- [ ] `Alt-Arrow` moves blocks and keeps the cursor
- [ ] Reopening preserves the order you left
