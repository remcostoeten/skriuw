import assert from "node:assert/strict";
import test from "node:test";
import { buildRestoreOperation } from "../../src/history/version-model";
import {
  reconcileRawMarkdown,
  updateRawMarkdown,
  type RawMarkdownState,
} from "../../src/editor/raw-markdown-reconciliation";

function clean(text = "current"): RawMarkdownState {
  return { noteId: "note-1", text, dirty: false };
}

test("same-note external updates replace clean raw source", () => {
  assert.deepEqual(
    reconcileRawMarkdown(clean(), "note-1", "external"),
    { noteId: "note-1", text: "external", dirty: false },
  );
});

test("history restore reconciles a clean raw editor for the same note", () => {
  const restored = buildRestoreOperation({
    noteId: "note-1",
    versionMarkdown: "# Restored\n",
    expectedRevision: 4,
    at: 10,
  });
  assert.equal(restored.type, "save_document");
  if (restored.type !== "save_document") {
    return;
  }

  assert.deepEqual(
    reconcileRawMarkdown(clean(), restored.noteId, restored.markdown),
    { noteId: "note-1", text: "# Restored\n", dirty: false },
  );
});

test("same-note external updates do not clobber dirty local source", () => {
  const dirty = updateRawMarkdown(clean(), "local draft");

  assert.equal(
    reconcileRawMarkdown(dirty, "note-1", "external"),
    dirty,
  );
});

test("matching optimistic saves mark local raw source clean", () => {
  const dirty = updateRawMarkdown(clean(), "saved draft");

  assert.deepEqual(
    reconcileRawMarkdown(dirty, "note-1", "saved draft"),
    { noteId: "note-1", text: "saved draft", dirty: false },
  );
});

test("note changes always reconcile after the prior note is flushed", () => {
  const dirty = updateRawMarkdown(clean(), "local draft");

  assert.deepEqual(
    reconcileRawMarkdown(dirty, "note-2", "next note"),
    { noteId: "note-2", text: "next note", dirty: false },
  );
});
