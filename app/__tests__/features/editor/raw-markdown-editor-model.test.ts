import assert from "node:assert/strict";
import test from "node:test";
import {
  countRawMarkdownWords,
  parseJumpToLineInput,
  rawMarkdownCursorStatus,
  rawMarkdownLineCount,
  rawMarkdownLineNumbers,
  rawMarkdownLineOffset,
  rawMarkdownLineScrollTop,
} from "../../../src/features/editor/raw-markdown-editor-model";

test("raw Markdown status counts words and always retains one line", () => {
  assert.equal(countRawMarkdownWords("# A small note\n\nwith words"), 6);
  assert.equal(countRawMarkdownWords(" \n\t "), 0);
  assert.equal(rawMarkdownLineCount(""), 1);
  assert.equal(rawMarkdownLineCount("one\ntwo\n"), 3);
  assert.deepEqual(rawMarkdownLineNumbers(3), [1, 2, 3]);
  assert.deepEqual(rawMarkdownLineNumbers(0), [1]);
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

test("line offsets point at the first character of a one-based line", () => {
  const markdown = "first\nsecond\nthird";
  assert.equal(rawMarkdownLineOffset(markdown, 1), 0);
  assert.equal(rawMarkdownLineOffset(markdown, 2), 6);
  assert.equal(rawMarkdownLineOffset(markdown, 3), 13);
  assert.equal(rawMarkdownLineOffset(markdown, 9), markdown.length);
  assert.equal(rawMarkdownLineOffset("", 1), 0);
  assert.equal(rawMarkdownLineOffset("a\n", 2), 2);
});

test("a jump centers its line in the viewport and never scrolls out of range", () => {
  assert.equal(rawMarkdownLineScrollTop(1, 100, 1_000, 200), 0);
  assert.equal(rawMarkdownLineScrollTop(50, 100, 1_000, 200), 395);
  assert.equal(rawMarkdownLineScrollTop(100, 100, 1_000, 200), 800);
  assert.equal(rawMarkdownLineScrollTop(1, 1, 200, 200), 0);
  assert.equal(rawMarkdownLineScrollTop(1, 0, 0, 200), 0);
});
