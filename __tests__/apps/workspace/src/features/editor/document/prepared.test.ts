import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import type { WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { PreparedEditorDocuments } from "@/features/editor/document/prepared";
import { productSchema } from "@/features/editor/schema";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";

const snapshot: WorkspaceSnapshot = {
  protocolVersion: 1,
  activeNoteId: "note-1",
  nodes: [
    {
      id: "note-1",
      kind: "note",
      parentId: null,
      rank: 1,
      title: "One",
      icon: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
  ],
  documents: [
    {
      noteId: "note-1",
      documentJson: { type: "doc", content: [{ type: "paragraph" }] },
      markdown: "",
      revision: 1,
      wordCount: 0,
    },
  ],
  settings: {
    settingsVersion: 1,
    theme: "midnight",
    compactSidebar: false,
    showPageIcons: true,
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
  store.applyOperations([
    {
      type: "save_document",
      noteId: "note-1",
      documentJson: json,
      markdown: "latest",
      wordCount: 1,
      expectedRevision: 1,
      at: 2,
    },
  ]);

  const record = store.getState().documents.get("note-1");
  assert.ok(record);
  assert.equal(prepared.documentFor(record), document);
  prepared.destroy();
});

test("malformed stored documents are diagnosed and use the empty fallback", () => {
  const malformed: WorkspaceSnapshot = {
    ...snapshot,
    documents: [
      {
        ...snapshot.documents[0]!,
        documentJson: { type: "unknown-node" },
      },
    ],
  };
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    const store = createRendererStore(createInitialState(malformed));
    const prepared = new PreparedEditorDocuments(store);
    const record = store.getState().documents.get("note-1");
    assert.ok(record);

    const fallback = prepared.documentFor(record);
    assert.equal(fallback.childCount, 1);
    assert.equal(fallback.firstChild?.type.name, "paragraph");
    assert.equal(fallback.textContent, "");
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.[0], "prepared editor document parse failed for note-1");
    prepared.destroy();
  } finally {
    console.error = originalError;
  }
});

function noteNode(id: string) {
  return { ...snapshot.nodes[0]!, id, title: id };
}

function noteDocument(noteId: string, text: string) {
  return {
    noteId,
    documentJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
    markdown: text,
    revision: 1,
    wordCount: 1,
  };
}

const workspace: WorkspaceSnapshot = {
  ...snapshot,
  nodes: ["note-1", "note-2", "note-3", "note-4"].map(noteNode),
  documents: ["note-1", "note-2", "note-3", "note-4"].map((id) => noteDocument(id, id)),
};

afterEach(() => {
  vi.useRealTimers();
});

test("prepares the visible note at once and the rest in idle batches", () => {
  vi.useFakeTimers();
  const store = createRendererStore(createInitialState(workspace));
  const prepared = new PreparedEditorDocuments(store);
  assert.equal(prepared.metrics().documentCount, 1);

  vi.runAllTimers();
  assert.equal(prepared.metrics().documentCount, 4);
  prepared.destroy();
});

test("a note requested before its idle batch is prepared on demand and reused", () => {
  vi.useFakeTimers();
  const store = createRendererStore(createInitialState(workspace));
  const prepared = new PreparedEditorDocuments(store);
  const record = store.getState().documents.get("note-3");
  assert.ok(record);

  const onDemand = prepared.documentFor(record);
  assert.equal(onDemand.textContent, "note-3");
  vi.runAllTimers();
  assert.equal(prepared.documentFor(record), onDemand);
  prepared.destroy();
});

test("a replaced document is prepared again from its new body", () => {
  vi.useFakeTimers();
  const store = createRendererStore(createInitialState(workspace));
  const prepared = new PreparedEditorDocuments(store);
  vi.runAllTimers();
  store.applyOperations([
    {
      type: "save_document",
      noteId: "note-2",
      documentJson: noteDocument("note-2", "rewritten").documentJson,
      markdown: "rewritten",
      wordCount: 1,
      expectedRevision: 1,
      at: 2,
    },
  ]);
  vi.runAllTimers();

  const record = store.getState().documents.get("note-2");
  assert.ok(record);
  assert.equal(prepared.documentFor(record).textContent, "rewritten");
  assert.equal(prepared.metrics().documentCount, 4);
  prepared.destroy();
});

test("destroy cancels idle preparation that has not run yet", () => {
  vi.useFakeTimers();
  const store = createRendererStore(createInitialState(workspace));
  const prepared = new PreparedEditorDocuments(store);
  prepared.destroy();
  vi.runAllTimers();
  assert.equal(prepared.metrics().documentCount, 0);
});
