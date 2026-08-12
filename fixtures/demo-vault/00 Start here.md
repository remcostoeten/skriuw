# Start here

A folder of notes for exercising the v2 editor by hand. Import it with the
command palette, `Import Markdown…`, and point it at `fixtures/demo-vault`.
Folder structure is preserved, so everything lands under `Editor` and
`Edge cases`.

Each note carries its own checklist. The point is not that the note *renders* —
the build already proves that. The point is that **editing it behaves**, and
that saving and reopening does not quietly change the text.

## The one check that matters most

The editor round-trips through markdown on every save. Silent corruption there
is the worst class of bug in this codebase and has happened before.

So for any note you touch:

1. Open it, change nothing, switch to another note and back.
2. Nothing should have moved, gained, or lost characters.

One caveat before you start: these files are hard-wrapped at 80 columns, and the
editor writes each paragraph as one long line. So the **first** save of every
note rewrites nearly every line without changing a single word. Compare words,
not lines. `Edge cases/08` lists that and the other five known divergences,
each one verified stable — check there before filing anything.

## Coverage

| Note | Exercises |
| --- | --- |
| `Editor/01` | Bold, italic, strikethrough, inline code, input rules |
| `Editor/02` | Headings, blockquotes, dividers, the slash menu |
| `Editor/03` | Bullet, ordered, nested and check lists |
| `Editor/04` | Code blocks, all fifteen highlighted languages, the language picker |
| `Editor/05` | Tables, cell navigation, column resizing |
| `Editor/06` | Links, the link popover, autolinking, opening links on desktop |
| `Editor/07` | Block drag handles, the gutter, reordering |
| `Edge cases/08` | Things that are known to be lossy or surprising |
| `Edge cases/09` | A note long enough to trip the bounded editor |

## Not covered here

Images, mentions and tags need real workspace state, so they are not in a
markdown fixture. Test those in a scratch note.
