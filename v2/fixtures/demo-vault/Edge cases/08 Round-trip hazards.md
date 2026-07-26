# Round-trip hazards

Everything here is a case where opening and saving is known to change the text,
or where it very nearly does. Open this note, change nothing, switch away and
back, then compare.

Divergences listed as **expected** are documented losses. Anything else that
moves is a bug.

All of the expected divergences below are verified: each one is stable, so it
happens once on the first save and never again.

## Expected: paragraphs are reflowed

This is the big one, and it affects every note in this folder. These source
files are hard-wrapped at 80 columns; the serializer writes each paragraph as a
single long line. So the *first* save of any imported note rewrites almost every
line, while the text itself is unchanged.

Compare words, not lines.

## Expected: bullet markers become asterisks

A list written with `-` comes back written with `*`. Check items keep `-`, which
is why a mixed list looks inconsistent afterwards.

## Expected: a pipe outside a table loses its escape

`a \| b` becomes `a | b`. Pipes only need escaping inside a table, so the text
is intact and the result is stable. Inside a table the escape is kept — that
case is in `Editor/05` and it does matter.

## Expected: bare URLs gain brackets

https://example.com comes back as `<https://example.com>`. Stable afterwards.

## Expected: table shape

Ragged rows are padded, headerless tables gain a header, alignment markers are
dropped. See `Editor/05`.

## Expected: mixed lists split

A list mixing bullets and check items becomes two adjacent lists.

- plain
- [ ] checked item
- plain again

## Must not change: escapes

These have all broken something at some point. None should gain or lose a
backslash.

- Literal asterisks: \*not bold\*
- Literal underscores: \_not italic\_
- Literal backtick: \`not code\`
- Literal brackets: \[not a link\]
- Hash not a heading: \# not a heading

## Must not change: characters that look like rules

- Seven hashes: ####### still text
- Four asterisks: ****
- A lone hyphen: -
- Two hyphens mid-sentence become an em dash — that is the smart rule, and it is
  expected the first time only

## Must not change: whitespace around inline nodes

Text glued to a link should stay glued and text with a space should keep it.
before[link](https://example.com)after and before [link](https://example.com)
after.

Spacing around inline nodes has been corrupted before by an over-eager trim, so
compare this paragraph carefully.

## Must not change: code block contents

Indentation, blank lines and trailing spaces inside a fence are content.

```python
def outer():
    def inner():
        return {
            "key": "value",
        }

    return inner
```

The blank line inside the function must still be there.

## Must not change: hard line breaks

A line ending in two spaces  
is a hard break, not a new paragraph.

## Must not change: nested structure

> A quote containing
>
> - a list
> - with two items
>
> and a closing paragraph.

## Checklist

- [ ] Only the six expected divergences above appear
- [ ] Every remaining escape survives
- [ ] Whitespace around the inline links is unchanged
- [ ] The blank line inside the Python function survives
- [ ] The hard line break stays a break
- [ ] A second reopen changes nothing at all
