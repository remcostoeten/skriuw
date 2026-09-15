import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRowLayout,
  countRawMarkdownWords,
  locateRow,
  parseJumpToLineInput,
  rawMarkdownCursorStatus,
  rawMarkdownLineCount,
  rowNumberAt,
  rowsForHeight,
} from "../../../src/features/editor/raw-markdown-editor-model";

test("raw Markdown status counts words and always retains one line", () => {
  assert.equal(countRawMarkdownWords("# A small note\n\nwith words"), 6);
  assert.equal(countRawMarkdownWords(" \n\t "), 0);
  assert.equal(rawMarkdownLineCount(""), 1);
  assert.equal(rawMarkdownLineCount("one\ntwo\n"), 3);
});

test("raw Markdown cursor status is one-based and selection-aware", () => {
  const markdown = "first line\nsecond words\nthird";
  assert.deepEqual(rawMarkdownCursorStatus(markdown, 15, 27), {
    line: 2,
    column: 5,
    selectedCharacters: 12,
    selectedWords: 3,
  });
});

test("raw Markdown cursor status clamps invalid selection offsets", () => {
  assert.deepEqual(rawMarkdownCursorStatus("hello", -3, 99), {
    line: 1,
    column: 1,
    selectedCharacters: 5,
    selectedWords: 1,
  });
});

test("jump-to-line entries clamp into the document and reject junk", () => {
  assert.equal(parseJumpToLineInput("3", 10), 3);
  assert.equal(parseJumpToLineInput("  7 ", 10), 7);
  assert.equal(parseJumpToLineInput("42", 10), 10);
  assert.equal(parseJumpToLineInput("1", 0), 1);
  assert.equal(parseJumpToLineInput("0", 10), null);
  assert.equal(parseJumpToLineInput("", 10), null);
  assert.equal(parseJumpToLineInput("-2", 10), null);
  assert.equal(parseJumpToLineInput("2.5", 10), null);
  assert.equal(parseJumpToLineInput("12a", 10), null);
});

test("row layout numbers every wrapped screen row across source lines", () => {
  const layout = buildRowLayout([1, 4, 1, 2]);
  assert.deepEqual(layout.starts, [1, 2, 6, 7]);
  assert.equal(layout.total, 8);
  assert.equal(rowNumberAt(layout, 1, 0), 2);
  assert.equal(rowNumberAt(layout, 1, 3), 5);
  assert.equal(rowNumberAt(layout, 1, 9), 5);
  assert.equal(rowNumberAt(layout, 3, -1), 7);
  assert.equal(buildRowLayout([]).total, 1);
});

test("row heights round to whole rows and never drop below one", () => {
  assert.equal(rowsForHeight(119, 23.8), 5);
  assert.equal(rowsForHeight(23.8, 24), 1);
  assert.equal(rowsForHeight(0, 24), 1);
  assert.equal(rowsForHeight(48, 0), 1);
});

test("locating a row resolves the source line and the row inside it", () => {
  const layout = buildRowLayout([1, 4, 1, 2]);
  assert.deepEqual(locateRow(layout, 1), { lineIndex: 0, rowIndex: 0 });
  assert.deepEqual(locateRow(layout, 4), { lineIndex: 1, rowIndex: 2 });
  assert.deepEqual(locateRow(layout, 6), { lineIndex: 2, rowIndex: 0 });
  assert.deepEqual(locateRow(layout, 8), { lineIndex: 3, rowIndex: 1 });
  assert.deepEqual(locateRow(layout, 40), { lineIndex: 3, rowIndex: 1 });
  assert.deepEqual(locateRow(layout, 0), { lineIndex: 0, rowIndex: 0 });
});
