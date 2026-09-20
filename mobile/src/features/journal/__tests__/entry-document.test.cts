import assert from "node:assert/strict";
import test from "node:test";
import { appendParagraphs, countWords, emptyEntryDocument } from "../entry-document";

test("the first capture replaces the empty paragraph a fresh entry carries", () => {
  const appended = appendParagraphs(emptyEntryDocument(), "", ["Caught this"]);

  assert.ok(appended.ok);
  assert.deepEqual(appended.body.documentJson, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Caught this" }] }],
  });
  assert.equal(appended.body.markdown, "Caught this\n");
  assert.equal(appended.body.wordCount, 2);
});

test("a later capture is added under what is already written", () => {
  const appended = appendParagraphs(
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] },
    "First\n",
    ["Second", "Third"],
  );

  assert.ok(appended.ok);
  assert.equal(appended.body.markdown, "First\n\nSecond\n\nThird\n");
  assert.equal((appended.body.documentJson as { content: unknown[] }).content.length, 3);
});

test("blank lines are dropped and an entirely blank capture is refused", () => {
  const mixed = appendParagraphs(emptyEntryDocument(), "", ["  ", "Kept", ""]);
  const blank = appendParagraphs(emptyEntryDocument(), "", ["   ", ""]);

  assert.ok(mixed.ok);
  assert.equal(mixed.body.markdown, "Kept\n");
  assert.equal(blank.ok, false);
  assert.equal(blank.ok === false && blank.reason, "nothing-to-append");
});

test("a document this build cannot read is refused rather than overwritten", () => {
  for (const payload of [null, "markdown", { type: "fragment" }, { type: "doc", content: 7 }]) {
    const appended = appendParagraphs(payload, "", ["Caught this"]);
    assert.equal(appended.ok, false, `expected a refusal for ${JSON.stringify(payload)}`);
    assert.equal(appended.ok === false && appended.reason, "unreadable-document");
  }
});

test("the word count ignores headings, the same rule the entry list reads", () => {
  assert.equal(countWords("# Sunday\n\nTwo words\n"), 2);
  assert.equal(countWords(""), 0);
});
