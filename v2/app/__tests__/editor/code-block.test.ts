import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../src/editor/schema";

function codeBlockDocument(params: string, code: string) {
  return productSchema.node("doc", null, [
    productSchema.node("code_block", { params }, [productSchema.text(code)]),
  ]);
}

test("code_block carries a params attribute defaulting to empty", () => {
  const codeBlock = productSchema.nodes.code_block;
  assert.ok(codeBlock);
  assert.equal(codeBlock.create().attrs.params, "");
});

test("a fenced block keeps its language when parsed", () => {
  const parsed = parseProductMarkdown("```ts\nconst a = 1;\n```");
  assert.equal(parsed.firstChild?.type.name, "code_block");
  assert.equal(parsed.firstChild?.attrs.params, "ts");
  assert.equal(parsed.firstChild?.textContent, "const a = 1;");
});

test("a language serializes back into the fence info string", () => {
  const markdown = serializeProductMarkdown(codeBlockDocument("rust", "fn main() {}"));
  assert.ok(markdown.startsWith("```rust\n"));
  assert.ok(markdown.trimEnd().endsWith("```"));
});

test("a language-less fence serializes as a bare fence", () => {
  const markdown = serializeProductMarkdown(codeBlockDocument("", "plain"));
  assert.equal(markdown.trimEnd(), "```\nplain\n```");
});

test("a fenced code block with a language survives a markdown roundtrip", () => {
  const original = "```tsx\nexport function App() {}\n```";
  const reparsed = parseProductMarkdown(original);
  const markdown = serializeProductMarkdown(reparsed);
  assert.equal(markdown.trimEnd(), original);
  const again = parseProductMarkdown(markdown);
  assert.equal(again.firstChild?.attrs.params, "tsx");
  assert.equal(again.firstChild?.textContent, "export function App() {}");
});

test("a language-less fenced block roundtrips without gaining a language", () => {
  const reparsed = parseProductMarkdown("```\njust text\n```");
  assert.equal(reparsed.firstChild?.attrs.params, "");
  assert.equal(serializeProductMarkdown(reparsed).trimEnd(), "```\njust text\n```");
});
