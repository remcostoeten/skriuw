# ADR-0040: Modal Vim editing

- Status: accepted
- Date: 2026-09-06

## Context

Writers who live in Vim asked for modal editing in both editors. ProseMirror
has no Vim mode and the community packages cover a handful of motions at most,
while CodeMirror 6 ships a mature one. ADR-0013 deferred the `vimMode` setting
until the editor was chosen; the editor is now a persistent direct ProseMirror
view over the rendered document and a source view for raw Markdown.

## Decision

One workspace setting, `vimMode` (a settings extension defaulting to off),
switches both editors at once. It is toggled from settings, the command
palette, or `mod+alt+i`.

The raw Markdown editor is a CodeMirror 6 view. Its Vim mode is the
`@replit/codemirror-vim` extension, installed through a compartment so the
setting can flip it without rebuilding the editor. `:w` flushes the pending
save; `:q`, `:wq`, and `:x` return the note to the rendered editor. Syntax color
comes from the Markdown grammar plus a small match decorator for Skriuw's own
tokens, all class-based so the theme sheet owns every color. The editor grows
with the note and the pane scrolls, matching the rendered editor.

Source lines wrap, and a Markdown paragraph is one source line, so the raw
view counts screen rows rather than source lines wherever a number is shown:
the gutter numbers every wrapped row, the status row and the jump-to-line
field use the same numbering, and plain `j` and `k` are non-recursive maps to
`gj` and `gk` in the normal and visual contexts only, so `dj` and other
operator motions keep Vim's source-line meaning. Row counts come from
CodeMirror's height map; which row of its line the cursor occupies needs
layout, so it is measured after each update and written back through a state
effect. Vim's own `:N` still targets source line N.

The rendered editor gets a ProseMirror plugin written for this document model.
A Vim line is one hard-break or newline separated segment of a textblock, so
`dd` on a bullet removes the bullet and `$` reaches the end of a paragraph.
Plain `j` and `k` move by the rows the view wrapped a line into, measured
through `coordsAtPos`, because a paragraph is one line and a logical step would
skip its whole body; they remember the screen x like `gj`/`gk`. Operator
motions such as `dj` and views without layout use logical lines. The plugin owns
only modal state and a per-view session (pending keys, prompt, macro
recording); every edit is an ordinary transaction, so history, remote merges,
bounded windows, and the save pipeline stay authoritative. Normal mode swallows
keys ahead of the product keymaps and blocks text input; insert mode leaves
every product behavior untouched, including slash menus and input rules.
Modifier combinations Vim does not own pass through to application shortcuts.

The host lends the plugin narrow hooks: enablement, note identity, bounded
undo/redo and window shifts, `:N` line jumps through the existing Markdown
line index, save, close-tab, the scroll container, and the clipboard. Mode
survives bounded window rebuilds. A mouse selection enters visual mode; the
bubble menu stays closed while Vim owns the selection.

## Consequences

Vim in the rendered editor covers normal, insert, visual, and visual-line
modes; counts; operators `d c y > < g~ gu gU` with motions, text objects, and
doubled forms; find and search motions including `*`, `#`, `n`, and `N` through
the note's search plugin; registers including named, append, black hole, and
system clipboard; dot repeat with inserted text; macros; and `:w`, `:q`, `:N`,
`:noh`, and `:s` with `%` and `'<,'>` ranges. Visual block mode, marks, and
folds are not implemented. Motions skip blocks that hold no text, such as
images and diagrams, and search in a bounded note sees the current window.

Raw Markdown highlighting no longer walks the whole source per keystroke; the
old character limit is gone. The raw editor's textarea, overlay, and scroll
synchronization are removed. The new dependency is CodeMirror 6 with its
Markdown language and the Vim extension, bundled in the main chunk so no editor
chunk loads after startup.
