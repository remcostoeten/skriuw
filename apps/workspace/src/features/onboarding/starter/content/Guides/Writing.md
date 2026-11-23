# Writing

You can do everything in this note by typing. The `/` menu is also available.

## The basics, by typing

Wrap a word in `**stars**` for **bold**, `*one star*` for *italic*, `~~tildes~~` for ~~struck through~~, and backticks for `inline code`. The marker characters disappear once the formatting applies.

Start a line with `#` and a space for a heading. More hashes make a smaller heading, down to six.

Start a line with `-` for a bullet, `1.` for a number, `>` for a quote, or three dashes for a divider.

---

## Lists

- Something to remember
- A step to take about it
  - A sub-item
    - A sub-item inside that

Checklists start with `- [ ]` and tick with a click:

- [x] Write the first note
- [ ] Write the second one
- [ ] Link the two notes

## Code blocks

Start a block with three backticks and the language name:

```typescript
function greet(name: string): string {
  return `Hello, ${name}`;
}
```

```bash
rg "todo" --type md
```

Skriuw highlights Bash, CSS, diff, Go, JavaScript, JSON, Markdown, Python, Rust, SQL, TypeScript, XML and YAML. Other languages display without highlighting.

## Tables

| Habit | Time | Keep |
| --- | --- | --- |
| Writing daily | 10 minutes | Yes |
| Organising daily | 40 minutes | No |
| Reading it back | 5 minutes | Yes |

Tab moves between cells. Enter at the end adds a row.

## Moving things around

Hover the left edge of a block to show a drag handle. Dragging the handle moves the whole block, including paragraphs, lists, tables and code.

> [[Linking]] covers organizing notes after you write them.
