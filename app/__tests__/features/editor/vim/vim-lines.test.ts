import assert from "node:assert/strict";
import test from "node:test";
import { parseProductMarkdown } from "../../../../src/features/editor/schema";
import {
  allLines,
  lineAbove,
  lineAt,
  lineBelow,
  lineOffset,
  positionAt,
} from "../../../../src/features/editor/vim/vim-lines";

test("hard breaks and code newlines split a block into Vim lines", () => {
  const doc = parseProductMarkdown("first\\\nsecond\n\n```\ncode a\ncode b\n```");
  const lines = allLines(doc);
  assert.deepEqual(
    lines.map((line) => [line.text, line.segmentIndex, line.segmentCount]),
    [
      ["first", 0, 2],
      ["second", 1, 2],
      ["code a", 0, 2],
      ["code b", 1, 2],
    ],
  );
  const second = lines[1]!;
  assert.equal(doc.textBetween(second.start, second.end), "second");
  assert.equal(positionAt(second, 0), second.start);
  assert.equal(positionAt(second, 99), second.end);
  assert.equal(lineOffset(second, second.start + 3), 3);
});

test("line stepping walks through nested list items and back", () => {
  const doc = parseProductMarkdown("- one\n  - two\n- three\n\npara");
  const first = lineAt(doc, 3);
  assert.ok(first);
  assert.equal(first.text, "one");
  const second = lineBelow(doc, first);
  assert.equal(second?.text, "two");
  const third = lineBelow(doc, second!);
  assert.equal(third?.text, "three");
  const fourth = lineBelow(doc, third!);
  assert.equal(fourth?.text, "para");
  assert.equal(lineBelow(doc, fourth!), null);
  assert.equal(lineAbove(doc, fourth!)?.text, "three");
  assert.equal(lineAbove(doc, third!)?.text, "two");
  assert.equal(lineAbove(doc, first), null);
});

test("positions outside textblocks resolve to no line", () => {
  const doc = parseProductMarkdown("para");
  assert.equal(lineAt(doc, 0), null);
  assert.equal(lineAt(doc, doc.content.size), null);
  assert.equal(lineAt(doc, 1)?.text, "para");
});
