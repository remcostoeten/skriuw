import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState } from "prosemirror-state";
import { normalizePastedMath } from "@/features/editor/math/paste";
import { markdownPasteSlice } from "@/features/editor/markdown/paste";
import { productSchema } from "@/features/editor/schema";

function paste(text: string) {
  return markdownPasteSlice(EditorState.create({ schema: productSchema }), text, new Set());
}

test("copied inline TeX becomes a math atom among prose", () => {
  const slice = paste(String.raw`Area \(\pi r^2\) today`);
  assert.ok(slice);
  const paragraph = slice.content.firstChild;
  assert.equal(paragraph?.child(1).type.name, "math_inline");
  assert.equal(paragraph?.child(1).attrs.tex, String.raw`\pi r^2`);
  assert.equal(slice.openStart, 1);
});

test("copied display delimiters become math blocks even surrounded by prose", () => {
  for (const text of [String.raw`Before \[x^2\] after`, "Before $$x^2$$ after", "$$\nx^2\n$$"]) {
    const slice = paste(text);
    assert.ok(slice);
    const names: string[] = [];
    slice.content.forEach((node) => names.push(node.type.name));
    assert.ok(names.includes("math_block"));
  }
});

test("strict dollar math pastes but prices and people stay literal", () => {
  assert.ok(paste("Value $x^2$ now"));
  for (const text of ["$5 and $10", "$ada met $bob", "$x$2", "$ x$", "$x $"]) {
    assert.equal(paste(text), null, text);
  }
});

test("escaped delimiters, inline code, fenced code and indented code stay untouched", () => {
  for (const text of [
    String.raw`\\(x\\)`,
    String.raw`\$x\$`,
    String.raw`\[x\\]`,
    "`\\(x\\)`",
    "`` ` $x$ ``",
    "```tex\n\\[x\\]\n$x$\n```",
    "~~~\n$$x$$\n~~~",
    "    \\(x\\)",
  ]) {
    const result = normalizePastedMath(text);
    assert.equal(result.hasMath, false, text);
    assert.equal(result.source, text);
  }
});

test("code around math remains literal while adjacent math converts", () => {
  const result = normalizePastedMath("`$code$` and \\(x\\)");
  assert.equal(result.hasMath, true);
  assert.ok(result.source.startsWith("`$code$` and $"));
  assert.deepEqual([...result.inline.values()], ["x"]);
});

test("pasting into a code block stays literal", () => {
  const state = EditorState.create({
    schema: productSchema,
    doc: productSchema.node("doc", null, [productSchema.node("code_block")]),
  });
  assert.equal(markdownPasteSlice(state, String.raw`\(x\)`, new Set()), null);
});

test("copied inline math preserves TeX dollars and a following digit", () => {
  for (const text of [String.raw`\(x\)2`, String.raw`\(a \$ b\)2`]) {
    const slice = paste(text);
    assert.ok(slice);
    assert.equal(slice.content.firstChild?.firstChild?.type.name, "math_inline");
    assert.equal(slice.content.firstChild?.lastChild?.text, "2");
  }
});

test("code fences nested in blockquotes and lists are protected", () => {
  for (const text of ["> ```tex\n> \\(x\\)\n> ```", "- Example\n  ```tex\n  \\(x\\)\n  ```"]) {
    const result = normalizePastedMath(text);
    assert.equal(result.hasMath, false);
    assert.equal(result.source, text);
  }
});

test("lossless raw Markdown never stores temporary math placeholders", () => {
  const text = "---\ntitle: Example\n---\n\\(x\\)2";
  const slice = paste(text);
  assert.equal(slice?.content.firstChild?.type.name, "raw_markdown");
  assert.equal(slice?.content.firstChild?.textContent, text);
});
