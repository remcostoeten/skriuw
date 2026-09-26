# Tables

## A plain table

| Language | Extension | Highlighted |
| --- | --- | --- |
| TypeScript | `.ts` | yes |
| Rust | `.rs` | yes |
| Plain text | `.txt` | no |

## Marks inside cells

| Style | Example | Note |
| --- | --- | --- |
| Bold | **strong** | survives |
| Italic | *slanted* | survives |
| Code | `inline()` | survives |
| Link | [example](https://example.com) | survives |

## Escaped pipes

A literal pipe inside a cell has to stay escaped through a save.

| Input | Meaning |
| --- | --- |
| `a \| b` | alternation |
| `\|\|` | logical or |

## Ragged source

The row below is short on purpose. The serializer pads rows to a rectangle, so
after one save this table gains empty cells. That is expected — check it does
not *lose* anything.

| One | Two | Three |
| --- | --- | --- |
| a | b |
| c | d | e |

## What to check

Insert a fresh table with `/table`, then:

- `Tab` moves to the next cell, `Shift-Tab` to the previous
- `Tab` in the last cell does something sensible rather than breaking out oddly
- Drag a column border to resize; the width should survive a reopen
- Selecting across cells highlights them
- A table as the last block still leaves somewhere to type below

There is no row or column menu yet. Adding and removing rows is keyboard-only,
which is a known gap rather than a bug.

## Known lossy

Recorded so you do not chase them:

- Column alignment (`:---:`) is dropped
- A headerless table gains a header row
- Cell content richer than one paragraph is flattened to text
- `rowspan` is dropped

## Checklist

- [ ] All four tables render with correct cell contents
- [ ] Escaped pipes survive a save and reopen
- [ ] `Tab` and `Shift-Tab` navigate cells
- [ ] Column resizing works and persists
- [ ] Reopening changes nothing beyond the documented lossy cases
