import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  codeBlockTokens,
  codeHighlightDecorations,
  codeHighlightKey,
  codeLanguageLabel,
  createCodeHighlightPlugin,
  highlightCode,
  resolveHighlightLanguage,
} from "../../../src/features/editor/code-highlight";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";

function codeBlock(params: string, code: string): ProseMirrorNode {
  return productSchema.node("code_block", { params }, [productSchema.text(code)]);
}

function document(...blocks: ProseMirrorNode[]): ProseMirrorNode {
  return productSchema.node("doc", null, blocks);
}

test("a registered language produces highlight tokens", () => {
  const tokens = highlightCode("ts", "const answer = 42;");
  assert.ok(tokens.length > 0);
  assert.ok(tokens.some((token) => token.className.includes("hljs-keyword")));
  assert.ok(tokens.every((token) => token.from < token.to));
});

test("token offsets stay inside the highlighted text", () => {
  const code = "function greet() { return 'hi'; }";
  for (const token of highlightCode("js", code)) {
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
  const changed = doc.copy(
    doc.content.replaceChild(1, codeBlock("ts", "const edited = 3;")),
  );
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

test("highlighting never alters the markdown roundtrip of a fenced block", () => {
  const original = "```ts\nconst a = 1;\n```";
  const parsed = parseProductMarkdown(original);
  codeHighlightDecorations(parsed);
  assert.equal(parsed.firstChild?.attrs.params, "ts");
  assert.equal(serializeProductMarkdown(parsed).trimEnd(), original);
});

test("a language label falls back to the raw params when unrecognised", () => {
  assert.equal(codeLanguageLabel("ts"), "TypeScript");
  assert.equal(codeLanguageLabel(""), "Plain text");
  assert.equal(codeLanguageLabel("Brainfuck"), "brainfuck");
});
