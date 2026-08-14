import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentLineIndex,
  documentLineTarget,
} from "../../../src/features/editor/document-lines";
import {
  parseProductMarkdown,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";

function lineOf(markdown: string, line: number) {
  const document = parseProductMarkdown(markdown);
  const index = buildDocumentLineIndex(document);
  return { index, target: documentLineTarget(document, index, line) };
}

test("the line index counts the lines the Markdown editor would show", () => {
  const markdown = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
  const document = parseProductMarkdown(markdown);
  const index = buildDocumentLineIndex(document);
  assert.equal(index.lineCount, serializeProductMarkdown(document).split("\n").length);
  assert.deepEqual([...index.blockStartLines], [1, 3, 5]);
});

test("a line resolves to the block that owns it, not an averaged position", () => {
  const markdown = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
  assert.deepEqual(lineOf(markdown, 1).target, { blockIndex: 0, offset: 0 });
  assert.deepEqual(lineOf(markdown, 3).target, { blockIndex: 1, offset: 0 });
  assert.deepEqual(lineOf(markdown, 5).target, { blockIndex: 2, offset: 0 });
});

test("a blank separator line belongs to the block above it", () => {
  const markdown = "First.\n\nSecond.";
  assert.deepEqual(lineOf(markdown, 2).target, { blockIndex: 0, offset: 0 });
});

test("tall blocks push later line numbers down instead of drifting", () => {
  const markdown = "```\none\ntwo\nthree\n```\n\nAfter the fence.";
  const { index } = lineOf(markdown, 1);
  assert.deepEqual([...index.blockStartLines], [1, 7]);
  assert.equal(lineOf(markdown, 7).target.blockIndex, 1);
});

test("a line inside a fenced code block lands on that code line", () => {
  const markdown = "```\none\ntwo\nthree\n```";
  assert.deepEqual(lineOf(markdown, 2).target, { blockIndex: 0, offset: 0 });
  assert.deepEqual(lineOf(markdown, 3).target, { blockIndex: 0, offset: 4 });
  assert.deepEqual(lineOf(markdown, 4).target, { blockIndex: 0, offset: 8 });
});

test("entries outside the document clamp to its ends", () => {
  const markdown = "# Title\n\nBody.";
  assert.deepEqual(lineOf(markdown, 0).target, { blockIndex: 0, offset: 0 });
  assert.equal(lineOf(markdown, 9_999).target.blockIndex, 1);
});

test("repeated identical blocks each keep their own line", () => {
  const markdown = "same\n\nsame\n\nsame";
  const { index } = lineOf(markdown, 1);
  assert.deepEqual([...index.blockStartLines], [1, 3, 5]);
  assert.equal(lineOf(markdown, 5).target.blockIndex, 2);
});
