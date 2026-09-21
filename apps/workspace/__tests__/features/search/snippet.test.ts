import assert from "node:assert/strict";
import test from "node:test";
import { snippetPlainText, snippetSegments } from "../../../src/features/search/snippet";

test("snippet marks become matched runs and the rest stays plain", () => {
  assert.deepEqual(snippetSegments("the <mark>migration</mark> plan"), [
    { text: "the ", matched: false },
    { text: "migration", matched: true },
    { text: " plan", matched: false },
  ]);
});

test("every match in a snippet is highlighted, including a leading one", () => {
  assert.deepEqual(snippetSegments("<mark>Atlas</mark> and <mark>Atlas</mark>"), [
    { text: "Atlas", matched: true },
    { text: " and ", matched: false },
    { text: "Atlas", matched: true },
  ]);
});

test("an unbalanced marker is read as ordinary text rather than a formatting hole", () => {
  const snippet = "a <mark>partial run";
  assert.deepEqual(snippetSegments(snippet), [{ text: snippet, matched: false }]);
  assert.equal(snippetPlainText(snippet), snippet);
});

test("plain text drops the delimiters so ranking never sees them", () => {
  assert.equal(snippetPlainText("…the <mark>migration</mark> plan…"), "…the migration plan…");
  assert.equal(snippetPlainText(""), "");
});
