import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildRestoreDocument,
  buildRestoreOperation,
  parseHistoryMarkdown,
} from "@/features/history/restore";

test("parseHistoryMarkdown reconstructs headings, lists, and marks", () => {
  const doc = parseHistoryMarkdown("# Title\n\nHello **world**.\n\n- one\n- two\n");

  const nodes = new Set<string>();
  const marks = new Set<string>();
  doc.descendants((node) => {
    nodes.add(node.type.name);
    for (const mark of node.marks) {
      marks.add(mark.type.name);
    }
  });
  assert.equal(doc.firstChild?.type.name, "heading");
  assert.ok(nodes.has("bullet_list"));
  assert.ok(marks.has("strong"));
  assert.equal(doc.textContent.includes("Hello world"), true);
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
