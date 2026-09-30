# ADR-0053: Math blocks and the dollar trigger

- Status: accepted
- Date: 2026-09-29

## Context

Notes need inline and display math. The portable Markdown spelling that
Obsidian, GitHub, Pandoc, and most static site generators read is `$...$` for
inline math and a `$$` fence for display math. In the editor, `$` already opens
the people menu, and person mentions export as `$name`. Math therefore has to
reuse the dollar in Markdown without taking the dollar away from people while
typing.

Rendering has to respect the [performance contract](../performance-contract.md):
no startup or navigation cost, no parsing in the typing path, and nothing loaded
from the network under the desktop CSP.

## Decision

Two canonical nodes carry math:

- `math_block`, a code-like textblock whose text is the TeX source. It exports as
  a `$$` line, the source, and a closing `$$` line.
- `math_inline`, an atom with a `tex` attribute. It exports as `$tex$`.

Typing `$` keeps opening the people menu exactly as before. There is no `$...$`
input rule. Math is created by:

- `/math` (block) and `/inline` (inline) in the slash menu;
- `mod+alt+e` for inline math and `mod+alt+shift+e` for a math block, both
  rebindable, and both turning selected text into the TeX;
- a line holding only `$$` followed by Enter, which becomes a math block. The
  second `$` already closes the people menu, because a `$` right after another
  `$` is not a mention trigger, so Enter reaches the editor.

The Markdown reader only accepts strict inline math: no whitespace after the
opening `$`, no whitespace before the closing `$`, the closing `$` not followed
by a digit, and both on one line. A lone `$ada`, `$ada met $bob`, and prices such
as `$5 and $10` stay text. The serializer escapes a text `$` as `\$` only when
it would otherwise pair up into math on the way back in, so ordinary dollars and
person mentions export unchanged. The full-text index reads the same pattern
and indexes the TeX without its delimiters.

Rendering uses KaTeX, pinned exactly and wrapped by
`apps/workspace/src/features/editor/math-render.ts`. KaTeX and its stylesheet
are a dynamic import on the first math node a note view meets; its fonts are
bundled assets, so nothing leaves the device. Renders are memoized by source and
mode, so a revisited note paints from the cache in the same frame. First renders
run in an idle callback, and re-renders while typing are debounced. Output is
`htmlAndMathml`: the visual HTML is hidden from assistive technology and the
MathML is exposed. `trust` is off, so `\href` and similar commands render as
errors instead of links.

A math block shows its source only while the caret is in it, and arrow keys at
a neighbouring textblock's edge move into that source explicitly, because the
collapsed source would otherwise be skipped by the browser. Escape returns to
the text after the block. Inline math opens a small popover field on Enter or
click; Enter, Escape, and Tab apply and return to the text, and arrow keys at
either end of the field step out of the node. TeX errors render as a quiet
message and never throw.

## Rejected alternatives

- **A `$...$` input rule.** It collides with the people trigger while typing and
  would turn prices into math.
- **A different Markdown spelling, such as `\(...\)` or a `math` code fence.**
  Other tools would not render it, and imported notes already use dollars.
- **MathJax.** Larger, slower to typeset, and heavier to load lazily. KaTeX
  renders synchronously to a string with MathML included.
- **Escaping every `$` on export.** Lossless, but it rewrites the Markdown of
  every note that mentions a price or a person.

## Consequences

- Imported Markdown whose text happens to match the strict pattern, such as
  `a$b$c`, now reads as math. That is the same rule other Markdown tools apply.
- Inline math immediately followed by a digit (`$x$2`) cannot be written in
  Markdown and reads back as text. TeX ending in a lone backslash has the same
  limit.
- `SEARCH_INDEX_VERSION` moved to 3, so existing workspaces rebuild their
  full-text index once.
- The KaTeX chunk and fonts load on first use only; the main bundle does not
  grow beyond the node views and commands.
