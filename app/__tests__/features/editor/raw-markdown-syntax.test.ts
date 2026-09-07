import assert from "node:assert/strict";
import test from "node:test";
import {
  RAW_MARKDOWN_PRODUCT_TOKEN_PATTERN,
  rawMarkdownProductTokenKind,
  rawMarkdownTokenClass,
} from "../../../src/features/editor/raw-markdown-syntax";

function tokensIn(line: string) {
  const pattern = new RegExp(RAW_MARKDOWN_PRODUCT_TOKEN_PATTERN.source, "gu");
  const found: { kind: string; text: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    const token = rawMarkdownProductTokenKind(match);
    if (token) found.push({ kind: token.kind, text: line.slice(token.from, token.to) });
  }
  return found;
}

test("product tokens pick out wiki links, chips, done tasks, html, and comments", () => {
  assert.deepEqual(tokensIn("Pull quotes into [[Launch checklist]] #reading with $Remco"), [
    { kind: "reference", text: "[[Launch checklist]]" },
    { kind: "tag", text: "#reading" },
    { kind: "person", text: "$Remco" },
  ]);
  assert.deepEqual(tokensIn("- [x] shipped <em>it</em> <!-- note -->"), [
    { kind: "task-done", text: "[x]" },
    { kind: "html", text: "<em>" },
    { kind: "html", text: "</em>" },
    { kind: "comment", text: "<!-- note -->" },
  ]);
});

test("chips need a word boundary so prices and anchors stay plain", () => {
  assert.deepEqual(tokensIn("costs US$40 and issue#12"), []);
  assert.deepEqual(tokensIn("(#tagged) [$Person]"), [
    { kind: "tag", text: "#tagged" },
    { kind: "person", text: "$Person" },
  ]);
});

test("open tasks and ordinary list bullets are not marked done", () => {
  assert.deepEqual(tokensIn("- [ ] pending"), []);
  assert.deepEqual(tokensIn("1) [X] numbered done"), [{ kind: "task-done", text: "[X]" }]);
  assert.deepEqual(tokensIn("[x] not a list item"), []);
});

test("token classes stay stable for the theme sheet", () => {
  assert.equal(rawMarkdownTokenClass("link-target"), "raw-markdown-token-link-target");
});
