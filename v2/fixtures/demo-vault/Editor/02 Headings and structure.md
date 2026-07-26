# Headings and structure

The first line of a note becomes its title in the sidebar. Editing this heading
should rename the note.

## Heading two
### Heading three
#### Heading four
##### Heading five
###### Heading six

Type `#` through `######` followed by a space to convert a paragraph. Seven
hashes is not a heading and must stay literal text.

## Blockquotes

> Type `>` and a space to start one.
>
> A blockquote holds multiple paragraphs, and **marks** work inside it.

> Quotes nest:
>
> > like this.

Backspace at the very start of a quote should lift the paragraph back out.

## Dividers

Four sequences produce a horizontal rule. Type each on an empty line:

---

`---`, `___` and `***` are the obvious three. The fourth is `—-`, which exists
because the smart-dash rule rewrites `--` to an em dash before the divider rule
ever sees it. That interaction has regressed before, so type all four.

A divider inserted as the last block must leave a paragraph below it to type
in. Insert one at the end of this note and check you are not stranded.

## Slash menu

Type `/` on an empty line.

- Filtering ranks exact prefix first, then alias prefix, then substring
- `Arrow` keys move, `Enter` and `Tab` both accept
- `Escape` closes it, and it must not reopen on the next keystroke
- Near the bottom of the window it flips above the cursor
- It must not open inside a code block
- It opens mid-line after a space, not only at the start

Every entry should insert its block and leave the cursor in a sensible place.

## Checklist

- [ ] Editing the title renames the note in the sidebar
- [ ] All six heading levels convert by typing
- [ ] Seven hashes stays literal
- [ ] Blockquotes nest, and backspace lifts out
- [ ] All four divider sequences work, including `—-`
- [ ] A trailing divider leaves somewhere to type
- [ ] Slash menu filtering, keyboard, flipping and suppression all behave
- [ ] Reopening the note changes nothing
