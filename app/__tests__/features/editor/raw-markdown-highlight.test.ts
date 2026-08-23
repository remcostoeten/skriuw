import assert from "node:assert/strict";
import test from "node:test";

import {
  highlightRawMarkdown,
  type RawMarkdownToken,
  type RawMarkdownTokenKind,
} from "../../../src/features/editor/raw-markdown-highlight";

function textOf(line: readonly RawMarkdownToken[]): string {
  return line.map((token) => token.text).join("");
}

function kindsFor(line: readonly RawMarkdownToken[], kind: RawMarkdownTokenKind): string[] {
  return line.filter((token) => token.kind === kind).map((token) => token.text);
}

test("highlighting is lossless: joined tokens rebuild the source line for line", () => {
  const markdown = [
    "---",
    "title: August reading",
    "---",
    "",
    "# August reading",
    "## This week",
    "* Finish *The Pragmatic Programmer* #reading",
    "* [x] Pull the good quotes into [[Launch checklist]]",
    "> Quoted with `code` and $Remco",
    "",
    "```ts",
    "const answer = **not bold**;",
    "```",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "See [the docs](https://example.com) and https://example.org/raw.",
    "A snake_case_name keeps its underscores.",
    "***",
  ].join("\n");

  const highlight = highlightRawMarkdown(markdown);
  assert.equal(highlight.length, markdown.split("\n").length);
  assert.equal(highlight.map(textOf).join("\n"), markdown);
});

test("block markers separate from their content", () => {
  const [heading] = highlightRawMarkdown("## This week");
  assert.deepEqual(heading, [
    { text: "## ", kind: "marker" },
    { text: "This week", kind: "heading" },
  ]);

  const [item] = highlightRawMarkdown("* [x] Done already");
  assert.deepEqual(item, [
    { text: "* ", kind: "marker" },
    { text: "[x] ", kind: "task-done" },
    { text: "Done already", kind: null },
  ]);

  const [rule] = highlightRawMarkdown("***");
  assert.deepEqual(rule, [{ text: "***", kind: "marker" }]);
});

test("product reference syntax gets its own kinds", () => {
  const [line] = highlightRawMarkdown("Pull quotes into [[Launch checklist]] for $Remco #reading");
  assert.deepEqual(kindsFor(line, "reference"), ["Launch checklist"]);
  assert.deepEqual(kindsFor(line, "person"), ["$Remco"]);
  assert.deepEqual(kindsFor(line, "tag"), ["#reading"]);
});

test("emphasis keeps its own colour while nested spans keep theirs", () => {
  const [line] = highlightRawMarkdown("Finish **the `git` manual**");
  assert.deepEqual(line, [
    { text: "Finish ", kind: null },
    { text: "**", kind: "marker" },
    { text: "the ", kind: "strong" },
    { text: "`", kind: "marker" },
    { text: "git", kind: "code" },
    { text: "`", kind: "marker" },
    { text: " manual", kind: "strong" },
    { text: "**", kind: "marker" },
  ]);
});

test("an underscore inside a word is not emphasis", () => {
  const [line] = highlightRawMarkdown("call snake_case_name twice");
  assert.deepEqual(line, [{ text: "call snake_case_name twice", kind: null }]);
});

test("a hash without a following label is not a tag", () => {
  const [line] = highlightRawMarkdown("issue # 4 and C# too");
  assert.deepEqual(kindsFor(line, "tag"), []);
});

test("fenced code is opaque until the fence closes", () => {
  const highlight = highlightRawMarkdown(["```ts", "# not a heading", "```", "# a heading"].join("\n"));
  assert.deepEqual(highlight[0], [
    { text: "```", kind: "marker" },
    { text: "ts", kind: "fence-info" },
  ]);
  assert.deepEqual(highlight[1], [{ text: "# not a heading", kind: "code" }]);
  assert.deepEqual(highlight[2], [{ text: "```", kind: "marker" }]);
  assert.deepEqual(highlight[3], [
    { text: "# ", kind: "marker" },
    { text: "a heading", kind: "heading" },
  ]);
});

test("front matter only opens on the first line", () => {
  const opening = highlightRawMarkdown(["---", "title: Note", "---", "body"].join("\n"));
  assert.deepEqual(opening[1], [
    { text: "title", kind: "property" },
    { text: ":", kind: "marker" },
    { text: " Note", kind: null },
  ]);
  assert.deepEqual(opening[3], [{ text: "body", kind: null }]);

  const later = highlightRawMarkdown(["body", "---", "title: Note"].join("\n"));
  assert.deepEqual(later[2], [{ text: "title: Note", kind: null }]);
});

test("skriuw marker comments read as comments, not content", () => {
  const [line] = highlightRawMarkdown("* A task <!--skriuw-task:abc123-->");
  assert.deepEqual(kindsFor(line, "comment"), ["<!--skriuw-task:abc123-->"]);
});

test("an empty document still yields one line", () => {
  assert.deepEqual(highlightRawMarkdown(""), [[]]);
});
