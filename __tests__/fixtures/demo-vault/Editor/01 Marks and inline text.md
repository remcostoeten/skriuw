# Marks and inline text

**Bold**, *italic*, ~~strikethrough~~ and `inline code`. Nested combinations:
***bold italic***, **bold around `code`**, *italic around a
[link](https://example.com)*.

Underscore forms are separate rules from asterisk forms and have broken
independently before: __bold__ and _italic_.

## Type these

Input rules fire on the closing character, so type each one straight through
without pausing:

- `**text**` becomes bold
- `__text__` becomes bold
- `*text*` becomes italic
- `_text_` becomes italic
- `~~text~~` becomes strikethrough
- `` `text` `` becomes inline code

A rule must not fire on an empty span. Typing `****` should leave four
asterisks sitting there, not an empty bold mark.

Underscores inside a word are not emphasis. `snake_case_name` must survive
being typed and stay one word.

## Keyboard

With text selected: `Mod-b` bold, `Mod-i` italic, `Mod-e` inline code,
`Mod-Shift-x` strikethrough. Each toggles off when pressed again.

## The bubble menu

Select any run of text and the toolbar appears above it.

- Buttons reflect the selection: select bold text, the bold button reads active
- Arrow keys move along the toolbar, Home and End jump to the ends
- `Tab` from the editor enters the toolbar, `Escape` returns to the text
- Scrolling dismisses it
- It must not appear inside a code block

## Smart replacements

Typing `--` gives an em dash — like that. Quotes curl: "double" and 'single'.
Three dots become an ellipsis…

These fire before other rules, which is why the divider rule in `Editor/02`
needs its own variant.

## Checklist

- [ ] Every input rule above fires while typing
- [ ] `****` stays literal
- [ ] `snake_case_name` survives
- [ ] Every keyboard shortcut toggles both ways
- [ ] Bubble menu keyboard navigation works
- [ ] Reopening the note changes nothing
