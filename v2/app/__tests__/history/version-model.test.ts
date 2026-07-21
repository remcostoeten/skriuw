import assert from "node:assert/strict";
import test from "node:test";
import type { HistoryHeader } from "../../src/contracts/workspace";
import {
  buildRestoreDocument,
  buildRestoreOperation,
  parseHistoryMarkdown,
  projectVersionList,
} from "../../src/history/version-model";

function header(partial: Partial<HistoryHeader> & Pick<HistoryHeader, "versionId">): HistoryHeader {
  return {
    noteId: "note-1",
    createdAt: 0,
    summary: "Saved",
    ...partial,
  };
}

test("projectVersionList orders versions newest first", () => {
  const headers = [
    header({ versionId: "a", createdAt: 100 }),
    header({ versionId: "b", createdAt: 300 }),
    header({ versionId: "c", createdAt: 200 }),
  ];

  const versions = projectVersionList(headers);

  assert.deepEqual(
    versions.map((version) => version.versionId),
    ["b", "c", "a"],
  );
});

test("projectVersionList returns an empty list for missing or empty headers", () => {
  assert.deepEqual(projectVersionList(null), []);
  assert.deepEqual(projectVersionList(undefined), []);
  assert.deepEqual(projectVersionList([]), []);
});

test("projectVersionList does not mutate the input array", () => {
  const headers = [header({ versionId: "a", createdAt: 1 }), header({ versionId: "b", createdAt: 2 })];
  const original = [...headers];

  projectVersionList(headers);

  assert.deepEqual(headers, original);
});

test("parseHistoryMarkdown reconstructs headings, lists, and marks", () => {
  const markdown = "# Title\n\nHello **world**.\n\n- one\n- two\n";

  const doc = parseHistoryMarkdown(markdown);

  assert.equal(doc.type.name, "doc");
  assert.equal(doc.textContent.includes("Hello world"), true);
});

test("parseHistoryMarkdown falls back to an empty paragraph for blank content", () => {
  const doc = parseHistoryMarkdown("");

  assert.equal(doc.childCount, 1);
  assert.equal(doc.child(0).type.name, "paragraph");
});

test("buildRestoreDocument derives JSON, markdown, and word count from version markdown", () => {
  const document = buildRestoreDocument("# Title\n\nHello world.\n");

  assert.equal(document.wordCount, 3);
  assert.equal(document.markdown.includes("Hello world"), true);
  assert.equal(typeof document.documentJson, "object");
});

test("buildRestoreOperation constructs a save_document operation from a version", () => {
  const operation = buildRestoreOperation({
    noteId: "note-1",
    versionMarkdown: "Hello world.\n",
    expectedRevision: 4,
    at: 1_000,
  });

  assert.equal(operation.type, "save_document");
  if (operation.type !== "save_document") {
    return;
  }
  assert.equal(operation.noteId, "note-1");
  assert.equal(operation.expectedRevision, 4);
  assert.equal(operation.at, 1_000);
  assert.equal(operation.wordCount, 2);
  assert.equal(operation.markdown.includes("Hello world"), true);
});
