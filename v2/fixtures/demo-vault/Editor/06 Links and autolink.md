# Links and autolink

## Written links

An [inline link](https://example.com), one with a
[longer label](https://github.com/remcostoeten/skriuw), and a link with
[**bold text**](https://example.com) inside it.

## Bare URLs

A bare URL autolinks as you type: <https://example.com>

Bare URLs come back from a save wrapped in angle brackets, which is the
markdown autolink form. It is a stable fixpoint, not corruption — it just shows
up as a diff the first time an old note is saved.

Things that must **not** become links, because fuzzy matching is deliberately
off:

- `config.json`
- `package.json`
- `readme.md`
- `1.2.3.4`
- `user@example.com`

## Typing rules

Type `[label](https://example.com)` straight through. The link forms on the
closing bracket.

Type a bare URL followed by a space. The rule fires before the space reaches the
document, so the space has to be re-inserted — if a character goes missing
there, that is the bug.

Paste a bare URL over a text selection: the selection becomes a link with the
pasted URL as its target, rather than being replaced.

## The link popover

Put the cursor inside any link above.

- The popover shows the URL with open, edit and remove
- Edit is an inline input: `Enter` applies, `Escape` closes, emptying it removes
  the link
- Applying a URL without a scheme normalises it to `https://`
- The popover stays open while you move focus into it, and closes on blur
  elsewhere or on scroll
- At the very start or end of a link the popover must not trigger — the mark is
  non-inclusive so typing beside a link does not extend it

Check that last one by typing immediately after `example.com](` above; the new
text must be plain.

## Opening links

- `Mod-click` or `Ctrl-click` a link opens it in the system browser
- On desktop this goes through the opener plugin, not the webview
- Only `http` and `https` open; anything else is ignored, including `mailto:`,
  which is no longer supported

`Mod-Shift-K` opens the link editor for the selection. Plain `Mod-K` is the
command palette, so it must not open a link editor.

## Checklist

- [ ] Written and bare links render
- [ ] None of the non-link strings above autolink
- [ ] Typing a URL then space keeps the space
- [ ] Pasting a URL over a selection links the selection
- [ ] Popover open, edit, remove and scheme normalisation all work
- [ ] Typing beside a link does not extend it
- [ ] `Mod-click` opens in the system browser
- [ ] `Mod-Shift-K` opens the editor, `Mod-K` opens the palette
- [ ] Reopening changes nothing except bare URLs gaining angle brackets once
