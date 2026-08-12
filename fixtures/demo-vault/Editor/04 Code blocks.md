# Code blocks

Every grammar bundled with the editor gets one block. Each should show coloured
keywords, strings, numbers and comments, and the toolbar in the corner should
name the language. Colours come from theme tokens, so switch themes and check
nothing turns unreadable.

The language picker only appears when the editor is editable.

## Plain text

```
No grammar. This should stay one flat colour.
def not_python(): return "not highlighted"
```

## Bash

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
name="${1:-world}"
for i in $(seq 1 3); do
  printf 'hello %s (%d)\n' "$name" "$i"
done
```

## CSS

```css
.block-gutter {
  position: fixed;
  z-index: 9; /* below the bubble menu */
  opacity: 0;
  transition: opacity 100ms ease-out;
}
```

## Diff

```diff
--- a/src/editor/schema.ts
+++ b/src/editor/schema.ts
@@ -12,3 +12,4 @@
   "Mod-Shift-x": toggleMark(strikethrough),
+  "Alt-ArrowUp": moveSelectedBlock(-1),
```

## Go

```go
package main

import "fmt"

func main() {
	items := []string{"alpha", "beta"}
	for i, item := range items {
		fmt.Printf("%d: %s\n", i, item)
	}
}
```

## HTML

```html
<div class="prosemirror-host" data-editor-font="serif">
  <!-- the editor mounts here -->
  <p>Hello &amp; welcome</p>
</div>
```

## JavaScript

```js
const languages = ["ts", "rust", "sql"];
function describe(list) {
  // template literals and numbers
  return `${list.length} languages, first is ${list[0]}`;
}
console.log(describe(languages));
```

## JSON

```json
{
  "version": "0.1.0",
  "platforms": ["linux-x86_64", "darwin-aarch64"],
  "draft": true,
  "assets": 17
}
```

## JSX

```jsx
export function Toolbar({ items, onPick }) {
  return (
    <div className="bubble-menu" role="toolbar">
      {items.map((item) => (
        <button key={item.id} onClick={() => onPick(item)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

## Markdown

```markdown
# A heading

Some **bold** text and a [link](https://example.com).

- a list item
- [ ] a task
```

## Python

```python
from dataclasses import dataclass


@dataclass
class Block:
    kind: str
    depth: int = 0

    def describe(self) -> str:
        return f"{self.kind} at depth {self.depth}"
```

## Rust

```rust
#[derive(Debug, Clone)]
pub struct Snapshot {
    pub version: u32,
    pub notes: Vec<String>,
}

impl Snapshot {
    pub fn is_empty(&self) -> bool {
        self.notes.is_empty()
    }
}
```

## SQL

```sql
SELECT n.id, n.title, COUNT(v.id) AS versions
FROM notes AS n
LEFT JOIN versions AS v ON v.note_id = n.id
WHERE n.deleted_at IS NULL
GROUP BY n.id
ORDER BY versions DESC
LIMIT 10;
```

## TypeScript

```ts
type BlockLocation = {
  pos: number;
  node: ProseMirrorNode;
};

export function moveBlockToIndex(position: number, toIndex: number): Command {
  return (state, dispatch) => {
    const block = topLevelBlockAt(state.doc, position);
    return block !== null;
  };
}
```

## TSX

```tsx
type Props = {
  open: boolean;
  onDismiss: () => void;
};

export function Menu({ open, onDismiss }: Props) {
  if (!open) return null;
  return <div className="slash-menu" onBlur={onDismiss} />;
}
```

## What to check

Create a fresh block with `/code`, then:

- The picker sets the language and the code recolours immediately
- Setting it back to plain text removes the colouring
- The chosen language survives a reopen — this was silent data loss once, where
  every fenced block came back as a bare fence
- `Enter` inside a block adds a line rather than leaving it
- Long lines wrap instead of scrolling off
- Typing in one block does not visibly re-highlight the others
- Markdown input rules do not fire inside code: typing `**bold**` here stays
  literal
- The slash menu does not open inside code

## Checklist

- [ ] All fifteen blocks are highlighted, plain text is not
- [ ] Colours hold up in every theme
- [ ] The picker changes language, and it survives a reopen
- [ ] Input rules and the slash menu are suppressed inside code
- [ ] Long lines wrap
- [ ] Reopening the note changes nothing
