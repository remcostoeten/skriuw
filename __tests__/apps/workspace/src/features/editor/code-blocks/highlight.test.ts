import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { Fragment, Slice, type Node as ProseMirrorNode } from "prosemirror-model";
import { type Decoration, DecorationSet } from "prosemirror-view";
import {
  codeBlockTokens,
  codeHighlightDecorations,
  codeHighlightKey,
  codeLanguageLabel,
  createCodeHighlightPlugin,
  highlightCode,
  resolveHighlightLanguage,
} from "@/features/editor/code-blocks/highlight";
import { productSchema } from "@/features/editor/schema";

function codeBlock(params: string, code: string): ProseMirrorNode {
  return productSchema.node("code_block", { params }, [productSchema.text(code)]);
}

function document(...blocks: ProseMirrorNode[]): ProseMirrorNode {
  return productSchema.node("doc", null, blocks);
}

function paragraph(text: string): ProseMirrorNode {
  return productSchema.node("paragraph", null, [productSchema.text(text)]);
}

function highlightedState(doc: ProseMirrorNode): EditorState {
  return EditorState.create({ doc, plugins: [createCodeHighlightPlugin(), history()] });
}

function byPosition(decorations: readonly Decoration[]): Decoration[] {
  return [...decorations].sort((left, right) => left.from - right.from || left.to - right.to);
}

function assertMatchesRebuild(state: EditorState): void {
  const rebuilt = DecorationSet.create(state.doc, codeHighlightDecorations(state.doc)).find();
  const incremental = codeHighlightKey.getState(state)?.find() ?? [];
  assert.deepEqual(byPosition(incremental), byPosition(rebuilt));
}

test("a registered language produces highlight tokens inside the highlighted text", () => {
  const tokens = highlightCode("ts", "const answer = 42;");
  assert.ok(tokens.length > 0);
  assert.ok(tokens.some((token) => token.className.includes("hljs-keyword")));
  assert.ok(tokens.every((token) => token.from < token.to));

  const code = "function greet() { return 'hi'; }";
  const jsTokens = highlightCode("js", code);
  assert.ok(jsTokens.length > 0);
  for (const token of jsTokens) {
    assert.ok(token.from >= 0);
    assert.ok(token.to <= code.length);
  }
});

test("an alias resolves to its registered grammar", () => {
  assert.equal(resolveHighlightLanguage("TSX"), "tsx");
  assert.equal(resolveHighlightLanguage("shell"), "shell");
  assert.equal(resolveHighlightLanguage("html"), "html");
});

test("an unknown language degrades to no tokens without throwing", () => {
  assert.deepEqual(highlightCode("brainfuck", "+++[->+++<]"), []);
  assert.equal(resolveHighlightLanguage("brainfuck"), null);
});

test("an empty language yields no tokens", () => {
  assert.deepEqual(highlightCode("", "const answer = 42;"), []);
  assert.equal(resolveHighlightLanguage(""), null);
});

test("decorations cover a known language and skip an unknown one", () => {
  const highlighted = codeHighlightDecorations(document(codeBlock("ts", "const a = 1;")));
  assert.ok(highlighted.length > 0);
  assert.deepEqual(codeHighlightDecorations(document(codeBlock("nope", "const a = 1;"))), []);
  assert.deepEqual(codeHighlightDecorations(document(codeBlock("", "const a = 1;"))), []);
});

test("decorations are positioned relative to the code block in the document", () => {
  const paragraph = productSchema.node("paragraph", null, [productSchema.text("intro")]);
  const doc = document(paragraph, codeBlock("json", '{"a": 1}'));
  const start = paragraph.nodeSize + 1;
  const decorations = codeHighlightDecorations(doc);
  assert.ok(decorations.length > 0);
  for (const decoration of decorations) {
    assert.ok(decoration.from >= start);
    assert.ok(decoration.to <= start + doc.child(1).content.size);
  }
});

test("tokens are memoised per code block node", () => {
  const node = codeBlock("rust", "fn main() { let x = 1; }");
  assert.equal(codeBlockTokens(node), codeBlockTokens(node));
});

test("editing one code block leaves the other block's tokens untouched", () => {
  const untouched = codeBlock("ts", "const kept = 1;");
  const doc = document(untouched, codeBlock("ts", "const edited = 2;"));
  const before = codeBlockTokens(doc.child(0));
  const changed = doc.copy(doc.content.replaceChild(1, codeBlock("ts", "const edited = 3;")));
  assert.equal(changed.child(0), untouched);
  assert.equal(codeBlockTokens(changed.child(0)), before);
});

test("the plugin exposes a decoration set for the current document", () => {
  const state = EditorState.create({
    doc: document(codeBlock("python", "def main():\n    return 1")),
    plugins: [createCodeHighlightPlugin()],
  });
  const decorations = codeHighlightKey.getState(state);
  assert.ok(decorations);
  assert.ok(decorations.find().length > 0);
});

test("the plugin keeps its decoration set across a selection-only transaction", () => {
  const state = EditorState.create({
    doc: document(codeBlock("go", "func main() {}")),
    plugins: [createCodeHighlightPlugin()],
  });
  const next = state.apply(state.tr.setMeta("noop", true));
  assert.equal(codeHighlightKey.getState(next), codeHighlightKey.getState(state));
});

test("the plugin rebuilds decorations after the text changes", () => {
  const state = EditorState.create({
    doc: document(codeBlock("ts", "const a = 1;")),
    plugins: [createCodeHighlightPlugin()],
  });
  const before = codeHighlightKey.getState(state)?.find().length ?? 0;
  const next = state.apply(state.tr.insertText(" const b = 2;", 13));
  const after = codeHighlightKey.getState(next)?.find().length ?? 0;
  assert.ok(after > before);
});

test("a language label falls back to the raw params when unrecognised", () => {
  assert.equal(codeLanguageLabel("ts"), "TypeScript");
  assert.equal(codeLanguageLabel(""), "Plain text");
  assert.equal(codeLanguageLabel("Brainfuck"), "brainfuck");
});

test("typing in a paragraph before two code blocks keeps the code decorations equivalent", () => {
  const state = highlightedState(
    document(paragraph("intro"), codeBlock("ts", "const a = 1;"), codeBlock("rust", "let b = 2;")),
  );
  const next = state.apply(state.tr.insertText("x", 3));
  assert.ok((codeHighlightKey.getState(next)?.find().length ?? 0) > 0);
  assertMatchesRebuild(next);
});

test("typing inside a code block shifts the later block and stays equivalent", () => {
  const state = highlightedState(
    document(paragraph("intro"), codeBlock("ts", "const a = 1;"), codeBlock("ts", "let b = 2;")),
  );
  const next = state.apply(state.tr.insertText(" const c = 'x';", 7 + 1 + 12));
  assertMatchesRebuild(next);
});

test("changing a code block's language re-highlights it", () => {
  const state = highlightedState(
    document(paragraph("intro"), codeBlock("ts", "fn main() { let x = 1; }")),
  );
  const next = state.apply(state.tr.setNodeMarkup(7, undefined, { params: "rust" }));
  assertMatchesRebuild(next);
});

test("setting a code block's language attribute directly re-highlights it", () => {
  const state = highlightedState(document(paragraph("intro"), codeBlock("", "const a = 1;")));
  assert.equal(codeHighlightKey.getState(state)?.find().length, 0);
  const next = state.apply(state.tr.setNodeAttribute(7, "params", "ts"));
  assert.ok((codeHighlightKey.getState(next)?.find().length ?? 0) > 0);
  assertMatchesRebuild(next);
});

test("converting a paragraph to a code block and back stays equivalent", () => {
  const codeBlockType = productSchema.nodes.code_block;
  const paragraphType = productSchema.nodes.paragraph;
  assert.ok(codeBlockType && paragraphType);
  const state = highlightedState(
    document(paragraph("const x = 1;"), codeBlock("ts", "const a = 1;")),
  );
  const converted = state.apply(state.tr.setBlockType(1, 1, codeBlockType, { params: "ts" }));
  assert.equal(converted.doc.child(0).type.name, "code_block");
  assertMatchesRebuild(converted);
  const restored = converted.apply(converted.tr.setBlockType(1, 1, paragraphType));
  assert.equal(restored.doc.child(0).type.name, "paragraph");
  assertMatchesRebuild(restored);
});

test("deleting across the end of a code block into the next paragraph stays equivalent", () => {
  const state = highlightedState(
    document(codeBlock("ts", "const a = 1;"), paragraph("between"), codeBlock("json", '{"b": 2}')),
  );
  const next = state.apply(state.tr.delete(1 + 6, 14 + 1 + 3));
  assertMatchesRebuild(next);
});

test("replacing the whole document with pasted code blocks stays equivalent", () => {
  const state = highlightedState(document(paragraph("intro"), codeBlock("ts", "const a = 1;")));
  const pasted = new Slice(
    Fragment.from([
      codeBlock("python", "def main():\n    return 1"),
      codeBlock("go", "func f() {}"),
    ]),
    0,
    0,
  );
  const next = state.apply(state.tr.replace(0, state.doc.content.size, pasted));
  assert.ok((codeHighlightKey.getState(next)?.find().length ?? 0) > 0);
  assertMatchesRebuild(next);
});

test("undoing a paste restores equivalent decorations", () => {
  const state = highlightedState(document(paragraph("intro"), codeBlock("ts", "const a = 1;")));
  const pasted = state.apply(
    state.tr.replace(
      0,
      state.doc.content.size,
      new Slice(Fragment.from(codeBlock("rust", "fn main() {}")), 0, 0),
    ),
  );
  let undone = pasted;
  assert.ok(undo(pasted, (transaction) => (undone = pasted.apply(transaction))));
  assert.ok(undone.doc.eq(state.doc));
  assertMatchesRebuild(undone);
});

test("a code block nested in a list item stays equivalent", () => {
  const item = productSchema.node("list_item", null, [
    paragraph("item"),
    codeBlock("ts", "const nested = 1;"),
  ]);
  const state = highlightedState(
    document(productSchema.node("bullet_list", null, [item]), codeBlock("rust", "let tail = 2;")),
  );
  const codeStart = 1 + 1 + paragraph("item").nodeSize + 1;
  const next = state.apply(state.tr.insertText(" const more = 2;", codeStart + 17));
  assert.ok((codeHighlightKey.getState(next)?.find().length ?? 0) > 0);
  assertMatchesRebuild(next);
});
