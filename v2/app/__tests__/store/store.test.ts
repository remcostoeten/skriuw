import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../src/contracts/workspace";
import { createInitialState, createRendererStore } from "../../src/store/store";

function node(partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind">): WorkspaceNode {
  return {
    parentId: null,
    rank: 0,
    title: partial.id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...partial,
  };
}

function snapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "note-child",
    nodes: [
      node({ id: "note-root", kind: "note", rank: 200 }),
      node({ id: "folder", kind: "folder", rank: 100 }),
      node({ id: "note-child", kind: "note", parentId: "folder", rank: 100 }),
      node({ id: "trashed", kind: "folder", rank: 300, deletedAt: 5 }),
      node({ id: "trashed-child", kind: "note", parentId: "trashed", rank: 100 }),
    ],
    documents: [
      {
        noteId: "note-child",
        documentJson: { type: "doc" },
        markdown: "child",
        revision: 1,
        wordCount: 7,
      },
      {
        noteId: "note-root",
        documentJson: { type: "doc" },
        markdown: "root",
        revision: 1,
        wordCount: 3,
      },
    ],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      reduceMotion: false,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "Start writing",
    },
  };
}

test("initial state orders siblings by rank and excludes trashed subtrees", () => {
  const state = createInitialState(snapshot());
  assert.deepEqual([...state.nodeOrder], ["folder", "note-child", "note-root"]);
  assert.deepEqual([...state.visibleIds], ["folder", "note-child", "note-root"]);
  assert.equal(state.nodes.has("trashed"), false);
  assert.equal(state.nodes.has("trashed-child"), false);
  assert.equal(state.activeNoteId, "note-child");
  assert.equal(state.metadata.get("note-child")?.wordCount, 7);
});

test("active note falls back to the first available document", () => {
  const source = snapshot();
  source.activeNoteId = "trashed-child";
  const state = createInitialState(source);
  assert.equal(state.activeNoteId, "note-child");
});

test("setActiveNote rejects unknown notes and moves focus", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  assert.equal(store.setActiveNote("missing"), false);
  assert.equal(store.setActiveNote("note-root"), true);
  assert.equal(store.getState().activeNoteId, "note-root");
  assert.equal(store.getState().focusedNodeId, "note-root");
});

test("collapsing a folder hides descendants and refocuses the folder", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.setActiveNote("note-child");
  assert.equal(store.toggleExpanded("folder"), true);
  assert.deepEqual([...store.getState().visibleIds], ["folder", "note-root"]);
  assert.equal(store.getState().focusedNodeId, "folder");
  assert.equal(store.toggleExpanded("note-root"), false);
});

test("optimistic create places the node last and activates new notes", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.applyOperations([
    {
      type: "create_note",
      id: "note-new",
      title: "Untitled",
      placement: { parentId: "folder", position: { type: "last" } },
      documentJson: { type: "doc" },
      markdown: "",
      at: 10,
    },
  ]);
  const state = store.getState();
  assert.deepEqual([...state.visibleIds], ["folder", "note-child", "note-new", "note-root"]);
  assert.equal(state.activeNoteId, "note-new");
  assert.equal(state.documents.get("note-new")?.revision, 0);
});

test("optimistic move honors before placement until the ack lands", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.applyOperations([
    {
      type: "move_node",
      id: "note-root",
      placement: { parentId: null, position: { type: "before", anchorId: "folder" } },
      at: 10,
    },
  ]);
  assert.deepEqual([...store.getState().visibleIds], ["note-root", "folder", "note-child"]);
  store.applyAck({
    applied: 1,
    revisions: [],
    rankChanges: [{ id: "note-root", parentId: null, rank: 50 }],
  });
  assert.deepEqual([...store.getState().visibleIds], ["note-root", "folder", "note-child"]);
});

test("trashing the active subtree clears the active note and lists a trash root", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.setActiveNote("note-child");
  store.applyOperations([{ type: "trash_subtree", rootId: "folder", at: 20 }]);
  const state = store.getState();
  assert.equal(state.activeNoteId, null);
  assert.equal(state.nodes.has("folder"), false);
  assert.equal(state.nodes.has("note-child"), false);
  assert.equal(state.sourceNodes.get("folder")?.deletedAt, 20);
  store.applyOperations([
    {
      type: "restore_subtree",
      rootId: "folder",
      placement: { parentId: null, position: { type: "last" } },
      at: 30,
    },
  ]);
  assert.deepEqual([...store.getState().visibleIds], ["note-root", "folder", "note-child"]);
});

test("purging a trashed subtree drops its documents", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.applyOperations([
    { type: "trash_subtree", rootId: "folder", at: 20 },
    { type: "purge_subtree", rootId: "folder", trashedBefore: 100 },
  ]);
  const state = store.getState();
  assert.equal(state.sourceNodes.has("folder"), false);
  assert.equal(state.sourceNodes.has("note-child"), false);
  assert.equal(state.documents.has("note-child"), false);
});

test("save_document updates content, word count, and metadata timestamp", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.applyOperations([
    {
      type: "save_document",
      noteId: "note-root",
      documentJson: { type: "doc", content: [] },
      markdown: "updated",
      wordCount: 12,
      expectedRevision: 1,
      at: 99,
    },
  ]);
  const state = store.getState();
  assert.equal(state.documents.get("note-root")?.markdown, "updated");
  assert.equal(state.metadata.get("note-root")?.wordCount, 12);
  assert.equal(state.metadata.get("note-root")?.updatedAt, 99);
});

test("selector subscribers only fire when their slice changes", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  let activeNotifications = 0;
  store.subscribe(
    (state) => state.activeNoteId,
    () => {
      activeNotifications += 1;
    },
  );
  store.toggleExpanded("folder");
  assert.equal(activeNotifications, 0);
  store.setActiveNote("note-root");
  assert.equal(activeNotifications, 1);
});
