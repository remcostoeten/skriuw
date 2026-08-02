import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceSnapshot } from "../../src/contracts/workspace";
import { PreparedEditorDocuments } from "../../src/editor/prepared-documents";
import { productSchema } from "../../src/editor/schema";
import { createInitialState, createRendererStore } from "../../src/store/store";

const snapshot: WorkspaceSnapshot = {
  protocolVersion: 1,
  activeNoteId: "note-1",
  nodes: [{
    id: "note-1",
    kind: "note",
    parentId: null,
    rank: 1,
    title: "One",
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  }],
  documents: [{
    noteId: "note-1",
    documentJson: { type: "doc", content: [{ type: "paragraph" }] },
    markdown: "",
    revision: 1,
    wordCount: 0,
  }],
  settings: {
    settingsVersion: 1,
    theme: "midnight",
    compactSidebar: false,
    showPageIcons: true,
    reduceMotion: false,
    rememberLastNote: true,
    editorFont: "inter",
    editorLineHeight: "comfortable",
    showLineNumbers: true,
    editorPlaceholder: "Start writing...",
  },
  historyHeaders: [],
};

test("prepares immutable documents once and reuses them across editor-state eviction", () => {
  const store = createRendererStore(createInitialState(snapshot));
  const prepared = new PreparedEditorDocuments(store);
  const record = store.getState().documents.get("note-1");
  assert.ok(record);

  const first = prepared.documentFor(record);
  const revisit = prepared.documentFor(record);
  assert.equal(revisit, first);
  assert.deepEqual(prepared.metrics(), { documentCount: 1, topLevelBlockCount: 1 });
  prepared.destroy();
});

test("an optimistic save adopts the staged editor node without reparsing", () => {
  const store = createRendererStore(createInitialState(snapshot));
  const prepared = new PreparedEditorDocuments(store);
  const document = productSchema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "latest" }] }],
  });
  const json = document.toJSON();
  prepared.stage("note-1", json, document);
  store.applyOperations([{
    type: "save_document",
    noteId: "note-1",
    documentJson: json,
    markdown: "latest",
    wordCount: 1,
    expectedRevision: 1,
    at: 2,
  }]);

  const record = store.getState().documents.get("note-1");
  assert.ok(record);
  assert.equal(prepared.documentFor(record), document);
  prepared.destroy();
});
