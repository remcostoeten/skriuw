import assert from "node:assert/strict";
import test from "node:test";
import { topLevelTextPosition } from "../../../src/features/editor/bounded-document";
import {
  buildDocumentLineIndex,
  documentLineAt,
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
  assert.deepEqual([...index.blockStartLines], [1, 2, 4]);
});

test("a line resolves to the block that owns it, not an averaged position", () => {
  const markdown = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
  assert.deepEqual(lineOf(markdown, 1).target, { blockIndex: 0, offset: 0 });
  assert.deepEqual(lineOf(markdown, 2).target, { blockIndex: 1, offset: 0 });
  assert.deepEqual(lineOf(markdown, 4).target, { blockIndex: 2, offset: 0 });
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

test("a line inside a hard-break paragraph lands on that visual line", () => {
  const markdown = "1\n2\n3\n4";
  const { index } = lineOf(markdown, 1);
  assert.equal(index.lineCount, 4);
  assert.deepEqual([...index.blockStartLines], [1]);
  assert.deepEqual(lineOf(markdown, 1).target, { blockIndex: 0, offset: 0 });
  assert.deepEqual(lineOf(markdown, 2).target, { blockIndex: 0, offset: 2 });
  assert.deepEqual(lineOf(markdown, 4).target, { blockIndex: 0, offset: 6 });
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

function landedText(markdown: string, line: number, source?: string): string {
  const document = parseProductMarkdown(markdown);
  const index = buildDocumentLineIndex(document, source);
  const target = documentLineTarget(document, index, line);
  const $position = document.resolve(
    topLevelTextPosition(document, target.blockIndex, target.offset),
  );
  return $position.parent.textBetween($position.parentOffset, $position.parent.content.size);
}

test("every item of a multi-line list is its own line target", () => {
  const markdown = "- one\n- two\n- three\n\nafter";
  const { index } = lineOf(markdown, 1);
  assert.equal(index.lineCount, 7);
  assert.deepEqual([...index.blockStartLines], [1, 7]);
  assert.equal(landedText(markdown, 1), "one");
  assert.equal(landedText(markdown, 3), "two");
  assert.equal(landedText(markdown, 5), "three");
  assert.equal(landedText(markdown, 7), "after");
});

test("nested list items, quote lines, and table rows resolve to their own textblock", () => {
  assert.equal(landedText("- parent\n  - child one\n  - child two\n- sibling", 5), "child two");
  assert.equal(landedText("- parent\n  - child one\n  - child two\n- sibling", 7), "sibling");
  assert.equal(landedText("> first\n>\n> second", 3), "second");
  assert.equal(landedText("| a | b |\n| --- | --- |\n| 1 | 2 |", 3), "1");
});

test("a line without text of its own lands on the nearest text above it", () => {
  const markdown = "- item\n\n  ```\n  code\n  ```\n\n- next";
  assert.equal(landedText(markdown, 3), "item");
  assert.equal(landedText(markdown, 5), "code");
});

test("the raw editor's Markdown drives line numbers when it still describes the document", () => {
  const stored = "- one\n- two\n- three\n\n> q1\n> q2";
  const document = parseProductMarkdown(stored);
  const index = buildDocumentLineIndex(document, stored);
  assert.equal(index.lineCount, 6);
  assert.deepEqual([...index.blockStartLines], [1, 5]);
  assert.equal(landedText(stored, 3, stored), "three");
  assert.equal(landedText(stored, 6, stored), "q2");
});

test("the caret's line is read back from its block-relative offset", () => {
  const markdown = "Intro\n\n- one\n- two\n- three";
  const document = parseProductMarkdown(markdown);
  const index = buildDocumentLineIndex(document);
  assert.deepEqual([...index.blockStartLines], [1, 3]);
  const three = documentLineTarget(document, index, 7);
  assert.equal(documentLineAt(index, three), 7);
  assert.equal(documentLineAt(index, { blockIndex: 1, offset: three.offset + 2 }), 7);
  assert.equal(documentLineAt(index, { blockIndex: 1, offset: 0 }), 3);
  assert.equal(documentLineAt(index, { blockIndex: 0, offset: 3 }), 1);
});
