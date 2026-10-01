import assert from "node:assert/strict";
import { test } from "vitest";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { findInlineMathEnd } from "@/features/editor/math-markdown";

function roundTrip(markdown: string): string {
  return serializeProductMarkdown(parseProductMarkdown(markdown));
}

function inlineMath(document: ProseMirrorNode): string[] {
  const found: string[] = [];
  document.descendants((node) => {
    if (node.type.name === "math_inline") found.push(String(node.attrs.tex));
    return true;
  });
  return found;
}

function paragraph(...content: ProseMirrorNode[]): ProseMirrorNode {
  return productSchema.node("doc", null, [productSchema.node("paragraph", null, content)]);
}

function person(label: string): ProseMirrorNode {
  const mention = productSchema.nodes.mention_ref;
  assert.ok(mention);
  return mention.create({ kind: "person", id: `person-${label}`, label });
}

function math(tex: string): ProseMirrorNode {
  const node = productSchema.nodes.math_inline;
  assert.ok(node);
  return node.create({ tex });
}

test("a $$ fence parses into a math block and exports unchanged", () => {
  const markdown = "Before\n\n$$\n\\int_0^1 x^2\\,dx\n= \\frac{1}{3}\n$$\n\nAfter";
  const document = parseProductMarkdown(markdown);
  const block = document.child(1);
  assert.equal(block.type.name, "math_block");
  assert.equal(block.textContent, "\\int_0^1 x^2\\,dx\n= \\frac{1}{3}");
  assert.equal(serializeProductMarkdown(document), markdown);
});

test("an empty math block round-trips", () => {
  assert.equal(roundTrip("$$\n$$"), "$$\n$$");
  assert.equal(parseProductMarkdown("$$\n$$").firstChild?.type.name, "math_block");
});

test("a one-line $$...$$ block is read and exported in the fenced form", () => {
  const document = parseProductMarkdown("$$E = mc^2$$");
  assert.equal(document.firstChild?.type.name, "math_block");
  assert.equal(document.firstChild?.textContent, "E = mc^2");
  assert.equal(serializeProductMarkdown(document), "$$\nE = mc^2\n$$");
});

test("an unclosed $$ fence stays text", () => {
  const document = parseProductMarkdown("$$\nx^2");
  assert.equal(document.firstChild?.type.name, "paragraph");
  assert.equal(roundTrip("$$\nx^2"), "$$\nx^2");
});

test("a $$ fence inside a code block stays code", () => {
  const markdown = "```\n$$\nx\n$$\n```";
  assert.equal(parseProductMarkdown(markdown).firstChild?.type.name, "code_block");
  assert.equal(roundTrip(markdown), markdown);
});

test("strict inline math parses and round-trips", () => {
  const markdown = "Energy is $E = mc^2$ and $\\alpha_1$, done.";
  const document = parseProductMarkdown(markdown);
  assert.deepEqual(inlineMath(document), ["E = mc^2", "\\alpha_1"]);
  assert.equal(serializeProductMarkdown(document), markdown);
});

test("an escaped dollar inside inline math does not close it", () => {
  const document = parseProductMarkdown("Cost $\\$5 + x$ total");
  assert.deepEqual(inlineMath(document), ["\\$5 + x"]);
  assert.equal(serializeProductMarkdown(document), "Cost $\\$5 + x$ total");
});

test("the strict pattern rejects spaces inside the delimiters and a digit after the close", () => {
  assert.equal(findInlineMathEnd("$ x$", 0), -1);
  assert.equal(findInlineMathEnd("$x $", 0), -1);
  assert.equal(findInlineMathEnd("$x$5", 0), -1);
  assert.equal(findInlineMathEnd("$$x$", 0), -1);
  assert.equal(findInlineMathEnd("$x\ny$", 0), -1);
  assert.equal(findInlineMathEnd("$x$.", 0), 2);
});

test("prices and lone dollars stay text", () => {
  for (const markdown of ["It costs $5 and $10.", "Paid $20 for $ 3 items", "US$ and $"]) {
    const document = parseProductMarkdown(markdown);
    assert.deepEqual(inlineMath(document), [], markdown);
    assert.equal(serializeProductMarkdown(document), markdown);
  }
});

test("$name people mentions in Markdown never become math", () => {
  for (const markdown of [
    "Met $ada and $bob today",
    "Ask $Grace Hopper, then $Linus",
    "$ada",
    "Owners: $ada $bob $carol",
  ]) {
    const document = parseProductMarkdown(markdown);
    assert.deepEqual(inlineMath(document), [], markdown);
    assert.equal(serializeProductMarkdown(document), markdown);
  }
});

test("person mention nodes still export as $name", () => {
  const document = paragraph(
    productSchema.text("With "),
    person("Ada"),
    productSchema.text(" and "),
    person("Bob"),
  );
  assert.equal(serializeProductMarkdown(document), "With $Ada and $Bob");
});

test("text dollars that would pair up are escaped so they stay text", () => {
  const document = paragraph(productSchema.text("a $b$ c"));
  const markdown = serializeProductMarkdown(document);
  assert.equal(markdown, "a \\$b$ c");
  const reparsed = parseProductMarkdown(markdown);
  assert.deepEqual(inlineMath(reparsed), []);
  assert.equal(reparsed.textContent, "a $b$ c");
});

test("a person mention followed by a closing-looking dollar stays a mention and text", () => {
  const document = paragraph(person("Ada"), productSchema.text(" paid x$ today"));
  const markdown = serializeProductMarkdown(document);
  assert.equal(markdown, "$Ada paid x\\$ today");
  assert.deepEqual(inlineMath(parseProductMarkdown(markdown)), []);
});

test("text dollars next to inline math cannot capture it", () => {
  const document = paragraph(
    productSchema.text("left $b "),
    math("c"),
    productSchema.text(" and $$x$ right"),
  );
  const markdown = serializeProductMarkdown(document);
  const reparsed = parseProductMarkdown(markdown);
  assert.deepEqual(inlineMath(reparsed), ["c"]);
  assert.equal(reparsed.textContent, "left $b $c$ and $$x$ right");
  assert.equal(serializeProductMarkdown(reparsed), markdown);
});

test("inline math inside marks and headings round-trips", () => {
  for (const markdown of ["# Area $\\pi r^2$", "**bold $x_1$ text**", "* item $a+b$"]) {
    assert.equal(roundTrip(markdown), markdown, markdown);
  }
});

test("dollars inside inline code are left alone", () => {
  const markdown = "Run `echo $a$` now";
  const document = parseProductMarkdown(markdown);
  assert.deepEqual(inlineMath(document), []);
  assert.equal(serializeProductMarkdown(document), markdown);
});

test("empty inline math is dropped on export", () => {
  assert.equal(serializeProductMarkdown(paragraph(productSchema.text("a "), math(""))), "a ");
});

test("math nodes survive JSON and HTML attribute round trips", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [math("x^2")]),
    productSchema.node("math_block", null, [productSchema.text("y = 1")]),
  ]);
  const restored = productSchema.nodeFromJSON(document.toJSON());
  assert.ok(restored.eq(document));
  const inlineDom = productSchema.nodes.math_inline?.spec.toDOM?.(math("x^2"));
  assert.ok(Array.isArray(inlineDom));
  assert.equal((inlineDom[1] as Record<string, string>)["data-tex"], "x^2");
});

test("inline math copies to plain text in its Markdown spelling", () => {
  const document = paragraph(productSchema.text("so "), math("x^2"));
  assert.equal(document.textBetween(0, document.content.size, "\n"), "so $x^2$");
});
