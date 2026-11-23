import assert from "node:assert/strict";
import { test } from "vitest";
import { parseProductMarkdown, productSchema } from "@/features/editor/schema";
import {
  activeLineIndex,
  documentLines,
  lineCount,
  linesBefore,
} from "@/features/editor/line-numbers/model";

function numbers(markdown: string): number[] {
  return documentLines(parseProductMarkdown(markdown)).map((line) => line.number);
}

test("each paragraph and heading is one line", () => {
  assert.deepEqual(numbers("# Title\n\none\n\ntwo"), [1, 2, 3]);
});

test("every line of a code block gets its own number", () => {
  const doc = parseProductMarkdown(
    "before\n\n```ts\nconst a = 1;\nconst b = 2;\n\nreturn a;\n```\n\nafter",
  );
  const lines = documentLines(doc);
  assert.deepEqual(
    lines.map((line) => line.number),
    [1, 2, 3, 4, 5, 6],
  );
  const code = doc.child(1);
  assert.equal(lineCount(code), 4);
  assert.equal(doc.textBetween(lines[2]!.from, lines[2]!.to), "const b = 2;");
  assert.equal(lines[3]!.from, lines[3]!.to);
});

test("hard breaks split a paragraph into lines", () => {
  const paragraph = productSchema.node("paragraph", null, [
    productSchema.text("one"),
    productSchema.node("hard_break"),
    productSchema.node("hard_break"),
    productSchema.text("three"),
  ]);
  const doc = productSchema.node("doc", null, [paragraph]);
  const lines = documentLines(doc);
  assert.equal(lines.length, 3);
  assert.equal(doc.textBetween(lines[0]!.from, lines[0]!.to), "one");
  assert.equal(lines[1]!.from, lines[1]!.to);
  assert.equal(doc.textBetween(lines[2]!.from, lines[2]!.to), "three");
});

test("a rule counts as one line anchored on its own box", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [productSchema.text("above")]),
    productSchema.node("horizontal_rule"),
    productSchema.node("paragraph", null, [productSchema.text("below")]),
  ]);
  const lines = documentLines(doc);
  assert.deepEqual(
    lines.map((line) => [line.number, line.anchorKind]),
    [
      [1, "text"],
      [2, "node"],
      [3, "text"],
    ],
  );
});

test("list items number their own lines and a table row counts once", () => {
  assert.deepEqual(numbers("- one\n- two\n  - nested\n\nend"), [1, 2, 3, 4]);
  const table = documentLines(parseProductMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n\nend"));
  assert.deepEqual(
    table.map((line) => line.number),
    [1, 2, 3],
  );
  assert.equal(table[0]!.anchorKind, "text");
});

test("a windowed editor offsets by the lines above its window", () => {
  const doc = parseProductMarkdown("one\n\n```\na\nb\nc\n```\n\nthree");
  assert.equal(linesBefore(doc, 0), 0);
  assert.equal(linesBefore(doc, 1), 1);
  assert.equal(linesBefore(doc, 2), 4);
  assert.equal(linesBefore(doc, 99), 5);
  assert.deepEqual(
    documentLines(doc, 41).map((line) => line.number),
    [41, 42, 43, 44, 45],
  );
});

test("the active line is the one holding the caret", () => {
  const doc = parseProductMarkdown("one\n\n```\na\nb\n```");
  const lines = documentLines(doc);
  assert.equal(activeLineIndex(lines, 2), 0);
  assert.equal(activeLineIndex(lines, lines[2]!.from), 2);
  assert.equal(activeLineIndex(lines, lines[1]!.to), 1);
});
