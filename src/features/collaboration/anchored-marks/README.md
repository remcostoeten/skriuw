# Anchored Marks Engine

A small, framework-light engine for **persistent, edit-surviving annotations**
anchored to ranges of a collaborative document. It powers comments today and is
built so highlights, suggested edits, AI notes, bookmarks, etc. are *adapters*,
not rewrites.

## Why an engine (and not just "comments")

Every annotation kind shares the same hard machinery:

1. **Anchoring that survives concurrent edits** — a stored offset breaks the
   instant someone types above it. We use Yjs relative positions instead.
2. **Realtime sync** — over the existing collab room, with no extra infra.
3. **Decoration mapping** — keeping highlights glued to text on every keystroke
   without re-resolving anchors.

What actually differs per kind is tiny: the **payload** and **how it paints**.
That asymmetry is exactly what an engine + adapter split is for.

## Layers (strict, one-directional dependencies)

```
types.ts                data contracts (no runtime deps)
store.ts                Y.Map CRUD + observe        — yjs only, no ProseMirror
registry.ts             type → renderer adapters     — pure
prosemirror/
  anchor-codec.ts       absolute ⇄ relative position — the ProseMirror seam
  plugin.ts             DecorationSet maintenance     — fast-path mapping
renderers/
  comment.ts            first adapter (highlight)
engine.ts               wires store + codec + registry to one EditorView
index.ts                public barrel
```

- The **store** never imports ProseMirror — anchors are opaque bytes to it.
- The **codec** is the *only* place that knows about y-prosemirror positions.
- The **renderers** are the adapter seam.

## Adding a new annotation type (the adapter pattern)

No engine change required:

```ts
// renderers/highlight.ts
export const HIGHLIGHT_MARK_TYPE = "highlight";
export function highlightRenderer(): TMarkRenderer {
  return {
    type: HIGHLIGHT_MARK_TYPE,
    buildDecorations({ mark, from, to }) {
      if (from >= to) return [];
      return [Decoration.inline(from, to, { class: "anchored-highlight" })];
    },
  };
}
```

Then register it:

```ts
const registry = new MarkRendererRegistry([commentRenderer(), highlightRenderer()]);
```

Unknown types are silently skipped, so an older client tolerates marks it can't
yet paint.

## Integration seam (BlockNote)

The engine needs two things from the editor, behind the existing collab gate:

1. The `anchoredMarksPlugin()` added to the ProseMirror plugin stack.
2. The live `EditorView`, passed to `engine.attach(view)` once, and
   `engine.dispose()` on unmount.

```ts
const map = getAnchoredMarkMap(collab.doc);
const store = new AnchoredMarkStore(map);
const registry = new MarkRendererRegistry([commentRenderer()]);
const engine = new AnchoredMarksEngine(collab.doc, store, registry);
engine.attach(view);          // view = BlockNote's ProseMirror view
// engine.create({ from, to }, { id, type: "comment", author, payload, createdAt });
// engine.dispose();          // on teardown
```

> BlockNote owns plugin creation, so the plugin is injected via
> `view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, anchoredMarksPlugin()] }))`
> after mount — the one spot that touches BlockNote internals. Keep it isolated
> here so a BlockNote upgrade only ever breaks this single call.

## Editor CSS (one rule block)

```css
.blocknote-wrapper .anchored-comment {
  background: hsl(var(--anchored-comment-color, var(--ring)) / 0.18);
  border-bottom: 2px solid hsl(var(--anchored-comment-color, var(--ring)) / 0.7);
  cursor: pointer;
}
.blocknote-wrapper .anchored-comment--resolved {
  background: transparent;
  border-bottom-style: dotted;
  opacity: 0.55;
}
```

## Performance & bundle

- **Zero new dependencies** — reuses `yjs`, `y-prosemirror`, `prosemirror-*`,
  all already pulled in by BlockNote.
- **No typing-path cost** — local edits only `DecorationSet.map`; anchors are
  re-resolved only when the mark store changes (human-paced).
- **Lazy** — side-effect-free and tree-shakeable; `import()` it behind the
  collab gate so solo notes ship none of it.
