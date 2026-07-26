import assert from "node:assert/strict";
import test from "node:test";
import {
  countRawMarkdownWords,
  rawMarkdownCursorStatus,
  rawMarkdownLineCount,
  rawMarkdownLineNumbers,
} from "../../src/editor/raw-markdown-editor-model";

test("raw Markdown status counts words and always retains one line", () => {
  assert.equal(countRawMarkdownWords("# A small note\n\nwith words"), 6);
  assert.equal(countRawMarkdownWords(" \n\t "), 0);
  assert.equal(rawMarkdownLineCount(""), 1);
  assert.equal(rawMarkdownLineCount("one\ntwo\n"), 3);
  assert.equal(rawMarkdownLineNumbers(3), "1\n2\n3");
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
