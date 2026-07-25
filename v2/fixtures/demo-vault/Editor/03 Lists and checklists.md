# Lists and checklists

## Bullets

- First
- Second
  - Nested once
    - Nested twice
- Third

Start one by typing `-`, `+` or `*` followed by a space.

## Ordered

1. First
2. Second
   1. Nested
   2. Also nested
3. Third

A list starting at a number other than one keeps its offset:

7. Seven
8. Eight
9. Nine

## Mixed nesting

1. Ordered parent
   - Bullet child
   - Another bullet
     1. Ordered grandchild
2. Back to the parent level

## Check lists

- [ ] Unchecked
- [x] Checked
- [ ] With **bold** and `code` inside
  - [ ] Nested check item
  - [x] Nested and checked

Type `[] ` or `[x] ` at the start of a line to create one. Click the box to
toggle it — that is a real document change, so it must persist across a reopen.

Markdown has no task syntax in CommonMark, so the parser rewrites bullet items
that begin with `[x] ` after the fact. A list mixing plain bullets and checks
therefore splits into two adjacent lists:

- Plain bullet
- [ ] Check item
- Another plain bullet

That split is expected. What is not expected is text going missing.

## Keyboard

Inside any list:

- `Enter` splits the item, and on an empty item lifts out of the list
- `Tab` indents, `Shift-Tab` outdents
- Both work on check items as well as plain ones

The `Tab` chain runs check items first, then list items, then table cells. If
`Tab` inside a list ever moves you to a table cell, that ordering has broken.

## Checklist

- [ ] All three list types start by typing
- [ ] The ordered list starting at 7 keeps its numbering
- [ ] Nesting works to at least three levels
- [ ] Clicking a checkbox toggles and survives a reopen
- [ ] `Enter`, `Tab` and `Shift-Tab` behave in every list type
- [ ] Reopening the note changes nothing
