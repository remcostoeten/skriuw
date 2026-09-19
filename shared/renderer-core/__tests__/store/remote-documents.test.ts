import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../src/contracts/workspace";
import { createInitialState, createRendererStore } from "../../src/store/store";

const settings = {
  settingsVersion: 1,
  theme: "system",
  compactSidebar: false,
  showPageIcons: true,
  reduceMotion: false,
  rememberLastNote: true,
  editorFont: "sans",
  editorLineHeight: "1.6",
  showLineNumbers: false,
  editorPlaceholder: "",
};

function node(id: string, rank: number, overrides: Partial<WorkspaceNode> = {}): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
    ...overrides,
  };
}

function body(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function document(noteId: string, revision: number, text: string) {
  return { noteId, documentJson: body(text), markdown: text, revision, wordCount: text.split(" ").length };
}

function snapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "a",
    nodes: [node("a", 1), node("b", 2), node("c", 3)],
    documents: [document("a", 1, "alpha"), document("b", 1, "bravo"), document("c", 1, "charlie")],
    historyHeaders: [],
    settings,
    tags: [],
    people: [],
    references: [],
    ...overrides,
  };
}

function createStore(initial = snapshot()) {
  return createRendererStore(createInitialState(initial));
}

test("applyRemoteDocuments adopts newer bodies and keeps unchanged records by identity", () => {
  const store = createStore();
  const before = store.getState();
  const keptA = before.documents.get("a");
  const changed = store.applyRemoteDocuments({
    documents: [document("a", 1, "alpha"), document("b", 2, "bravo from another device")],
    nodes: [node("a", 1), node("b", 2, { updatedAt: 9 })],
  });
  const after = store.getState();
  assert.equal(changed, true);
  assert.equal(after.documents.get("a"), keptA);
  assert.equal(after.documents.get("b")?.revision, 2);
  assert.equal(after.documents.get("b")?.markdown, "bravo from another device");
  assert.equal(after.metadata.get("b")?.wordCount, 4);
  assert.equal(after.metadata.get("b")?.updatedAt, 9);
  assert.equal(after.nodes, before.nodes, "an unchanged placement keeps the tree index");
  assert.equal(after.noteIds, before.noteIds);
  assert.equal(after.sourceNodes.get("a"), before.sourceNodes.get("a"));
});

test("applyRemoteDocuments never rewinds a document the renderer already moved past", () => {
  const store = createStore();
  store.applyOperations([
    {
      type: "save_document",
      noteId: "a",
      documentJson: body("alpha typed locally"),
      markdown: "alpha typed locally",
      wordCount: 3,
      expectedRevision: 1,
      at: 5,
    },
  ]);
  store.applyAck({ applied: 1, revisions: [{ id: "a", revision: 5 }], rankChanges: [] });
  const local = store.getState().documents.get("a");
  const changed = store.applyRemoteDocuments({
    documents: [document("a", 3, "stale remote body")],
    nodes: [node("a", 1)],
  });
  assert.equal(changed, false);
  assert.equal(store.getState().documents.get("a"), local);
});

test("applyRemoteDocuments derives the tree when a node's placement or title changed", () => {
  const store = createStore();
  const before = store.getState();
  store.applyRemoteDocuments({
    documents: [document("c", 2, "charlie renamed")],
    nodes: [node("c", 0, { title: "Charlie first" })],
  });
  const after = store.getState();
  assert.notEqual(after.nodes, before.nodes);
  assert.deepEqual(after.noteIds, ["c", "a", "b"]);
  assert.equal(after.metadata.get("c")?.title, "Charlie first");
});

test("applyRemoteDocuments with nothing new leaves state identity untouched", () => {
  const store = createStore();
  const before = store.getState();
  assert.equal(
    store.applyRemoteDocuments({
      documents: [document("a", 1, "alpha")],
      nodes: [node("a", 1)],
    }),
    false,
  );
  assert.equal(store.getState(), before);
});

test("replaceFromSnapshot keeps the current record when it is ahead of the snapshot", () => {
  const store = createStore();
  store.applyOperations([
    {
      type: "save_document",
      noteId: "a",
      documentJson: body("alpha newer"),
      markdown: "alpha newer",
      wordCount: 2,
      expectedRevision: 1,
      at: 5,
    },
  ]);
  store.applyAck({ applied: 1, revisions: [{ id: "a", revision: 4 }], rankChanges: [] });
  const ahead = store.getState().documents.get("a");
  store.replaceFromSnapshot(
    snapshot({ documents: [document("a", 2, "alpha older"), document("b", 1, "bravo"), document("c", 1, "charlie")] }),
  );
  assert.equal(store.getState().documents.get("a"), ahead);
});

test("replaceFromSnapshot reuses records and the tree index when nothing structural changed", () => {
  const store = createStore();
  const before = store.getState();
  store.replaceFromSnapshot(
    snapshot({
      documents: [document("a", 1, "alpha"), document("b", 3, "bravo remote"), document("c", 1, "charlie")],
      nodes: [node("a", 1), node("b", 2, { updatedAt: 42 }), node("c", 3)],
    }),
  );
  const after = store.getState();
  assert.equal(after.documents.get("a"), before.documents.get("a"));
  assert.equal(after.documents.get("c"), before.documents.get("c"));
  assert.equal(after.documents.get("b")?.markdown, "bravo remote");
  assert.equal(after.nodes, before.nodes);
  assert.equal(after.childrenByParent, before.childrenByParent);
  assert.equal(after.noteIds, before.noteIds);
  assert.equal(after.visibleIds.length, before.visibleIds.length);
  assert.equal(after.metadata.get("a"), before.metadata.get("a"));
  assert.equal(after.metadata.get("b")?.updatedAt, 42);
  assert.equal(after.sourceNodes.get("a"), before.sourceNodes.get("a"));
  assert.equal(after.panes, before.panes);
});

test("replaceFromSnapshot re-derives when a node moved, was trashed, or appeared", () => {
  const store = createStore();
  const before = store.getState();
  store.replaceFromSnapshot(
    snapshot({
      nodes: [node("a", 1), node("b", 2, { deletedAt: 7 }), node("c", 3), node("d", 4)],
      documents: [
        document("a", 1, "alpha"),
        document("b", 1, "bravo"),
        document("c", 1, "charlie"),
        document("d", 1, "delta"),
      ],
    }),
  );
  const after = store.getState();
  assert.notEqual(after.nodes, before.nodes);
  assert.deepEqual(after.noteIds, ["a", "c", "d"]);
  assert.equal(after.documents.get("a"), before.documents.get("a"));
});

test("replaceFromSnapshot treats a cover change as structural", () => {
  const store = createStore();
  const before = store.getState();
  store.replaceFromSnapshot(
    snapshot({ nodes: [node("a", 1, { coverImageId: "img" }), node("b", 2), node("c", 3)] }),
  );
  assert.notEqual(store.getState().nodes, before.nodes);
  assert.equal(store.getState().sourceNodes.get("a")?.coverImageId, "img");
});
