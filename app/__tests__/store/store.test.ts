import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../src/contracts/workspace";
import { createInitialState, createRendererStore } from "../../src/store/store";
import { pinnedNodeIds } from "../../src/store/tree";

function node(partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind">): WorkspaceNode {
  return {
    parentId: null,
    rank: 0,
    title: partial.id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
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

test("set_node_pinned pins and unpins available nodes and survives trash without edits", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.applyOperations([{ type: "set_node_pinned", id: "note-root", pinned: true, at: 50 }]);
  assert.equal(store.getState().sourceNodes.get("note-root")?.pinnedAt, 50);

  store.applyOperations([{ type: "set_node_pinned", id: "trashed", pinned: true, at: 51 }]);
  assert.equal(store.getState().sourceNodes.get("trashed")?.pinnedAt, null);

  store.applyOperations([{ type: "trash_subtree", rootId: "note-root", at: 60 }]);
  assert.equal(store.getState().sourceNodes.get("note-root")?.pinnedAt, 50);

  store.applyOperations([
    {
      type: "restore_subtree",
      rootId: "note-root",
      placement: { parentId: null, position: { type: "last" } },
      at: 70,
    },
    { type: "set_node_pinned", id: "note-root", pinned: false, at: 80 },
  ]);
  assert.equal(store.getState().sourceNodes.get("note-root")?.pinnedAt, null);
});

test("set_note_cover updates only owning note", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.applyOperations([
    { type: "set_note_cover", noteId: "note-root", imageId: "cover-1", at: 50 },
  ]);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverImageId, "cover-1");
  assert.equal(store.getState().sourceNodes.get("note-child")?.coverImageId, undefined);

  store.applyOperations([
    {
      type: "set_note_cover_full_width",
      noteId: "note-root",
      fullWidth: true,
      at: 55,
    },
  ]);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverFullWidth, true);

  store.applyOperations([
    {
      type: "set_note_cover_transform",
      noteId: "note-root",
      positionX: 20,
      positionY: 75,
      zoom: 1.6,
      at: 57,
    },
  ]);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverPositionX, 20);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverPositionY, 75);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverZoom, 1.6);

  store.applyOperations([
    { type: "set_note_cover", noteId: "note-root", imageId: null, at: 60 },
  ]);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverImageId, null);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverFullWidth, false);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverPositionX, 50);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverPositionY, 50);
  assert.equal(store.getState().sourceNodes.get("note-root")?.coverZoom, 1);
});

test("pinnedNodeIds orders most-recently-pinned-first and hides trashed nodes", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.applyOperations([
    { type: "set_node_pinned", id: "note-root", pinned: true, at: 10 },
    { type: "set_node_pinned", id: "folder", pinned: true, at: 20 },
    { type: "set_node_pinned", id: "note-child", pinned: true, at: 30 },
  ]);
  const nodesOf = () => [...store.getState().sourceNodes.values()];
  assert.deepEqual(pinnedNodeIds(nodesOf()), ["note-child", "folder", "note-root"]);

  store.applyOperations([{ type: "trash_subtree", rootId: "folder", at: 40 }]);
  assert.deepEqual(pinnedNodeIds(nodesOf()), ["note-root"]);

  store.applyOperations([
    {
      type: "restore_subtree",
      rootId: "folder",
      placement: { parentId: null, position: { type: "last" } },
      at: 50,
    },
  ]);
  assert.deepEqual(pinnedNodeIds(nodesOf()), ["note-child", "folder", "note-root"]);
});

test("initial state restores only durable folder expansion ids", () => {
  const state = createInitialState(snapshot(), ["folder", "note-root", "missing"]);
  assert.deepEqual([...state.expandedIds], ["folder"]);
  assert.deepEqual([...state.visibleIds], ["folder", "note-child", "note-root"]);
  const collapsed = createInitialState(snapshot(), []);
  assert.deepEqual([...collapsed.visibleIds], ["folder", "note-root"]);
});

test("active note falls back to the first available document", () => {
  const source = snapshot();
  source.activeNoteId = "trashed-child";
  const state = createInitialState(source);
  assert.equal(state.activeNoteId, "note-child");
});

test("disabling remember-last-note ignores the persisted active note", () => {
  const source = snapshot();
  source.settings = { ...source.settings, rememberLastNote: false };
  const state = createInitialState(source);
  assert.equal(state.activeNoteId, "note-child");
  assert.equal(state.focusedNodeId, "note-child");
  source.activeNoteId = "note-root";
  const rerun = createInitialState(source);
  assert.equal(rerun.activeNoteId, "note-child");
});

test("setActiveNote rejects unknown notes and moves focus", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  assert.equal(store.setActiveNote("missing"), false);
  assert.equal(store.setActiveNote("note-root"), true);
  assert.equal(store.getState().activeNoteId, "note-root");
  assert.equal(store.getState().focusedNodeId, "note-root");
});

test("tree selection supports replace, toggle, and visible ranges without changing the active note", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.selectTreeNode("folder", "replace");
  store.selectTreeNode("note-root", "range");
  assert.deepEqual([...store.getState().selectedNodeIds], ["folder", "note-child", "note-root"]);
  assert.equal(store.getState().selectionAnchorId, "folder");
  assert.equal(store.getState().activeNoteId, "note-child");
  store.selectTreeNode("note-child", "toggle");
  assert.deepEqual([...store.getState().selectedNodeIds], ["folder", "note-root"]);
  assert.equal(store.getState().selectionAnchorId, "note-child");
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
  assert.equal(
    (store.getState().sourceNodes.get("note-root")?.rank ?? 0) <
      (store.getState().sourceNodes.get("folder")?.rank ?? 0),
    true,
  );
  assert.deepEqual([...store.getState().visibleIds], ["folder", "note-child", "note-root"]);
  store.applyAck({
    applied: 1,
    revisions: [],
    rankChanges: [{ id: "note-root", parentId: null, rank: 50 }],
  });
  assert.equal(store.getState().sourceNodes.get("note-root")?.rank, 50);
  assert.deepEqual([...store.getState().visibleIds], ["folder", "note-child", "note-root"]);
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
  assert.deepEqual([...store.getState().visibleIds], ["folder", "note-child", "note-root"]);
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
  assert.equal(state.expandedIds.has("folder"), false);
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

test("save_document keeps structural identities and never notifies tree subscribers", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = store.getState();
  let treeNotifications = 0;
  store.subscribe(
    (state) => state.nodeOrder,
    () => {
      treeNotifications += 1;
    },
  );
  store.subscribe(
    (state) => state.nodes,
    () => {
      treeNotifications += 1;
    },
  );
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
  const after = store.getState();
  assert.equal(treeNotifications, 0);
  assert.equal(after.nodes, before.nodes);
  assert.equal(after.nodeOrder, before.nodeOrder);
  assert.equal(after.noteIds, before.noteIds);
  assert.equal(after.visibleIds, before.visibleIds);
  assert.equal(after.metadata.get("note-child"), before.metadata.get("note-child"));
  assert.equal(after.metadata.get("note-root")?.wordCount, 12);
});

test("revision-only acks update documents without touching structural state", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = store.getState();
  let treeNotifications = 0;
  store.subscribe(
    (state) => state.nodeOrder,
    () => {
      treeNotifications += 1;
    },
  );
  store.applyAck({
    applied: 1,
    revisions: [{ id: "note-root", revision: 2 }],
    rankChanges: [],
  });
  const after = store.getState();
  assert.equal(treeNotifications, 0);
  assert.equal(after.documents.get("note-root")?.revision, 2);
  assert.equal(after.sourceNodes, before.sourceNodes);
  assert.equal(after.nodes, before.nodes);
  assert.equal(after.nodeOrder, before.nodeOrder);
  assert.equal(after.metadata, before.metadata);
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

test("history publication is exactly once, stable, and note scoped", () => {
  const source = snapshot();
  source.historyHeaders = [
    {
      noteId: "note-child",
      versionId: "version-b",
      createdAt: 10,
      summary: "Second",
    },
  ];
  const store = createRendererStore(createInitialState(source));
  let childHistoryNotifications = 0;
  let rootHistoryNotifications = 0;
  let shellNotifications = 0;
  store.subscribe(
    (state) => state.historyHeaders.get("note-child"),
    () => {
      childHistoryNotifications += 1;
    },
  );
  store.subscribe(
    (state) => state.historyHeaders.get("note-root"),
    () => {
      rootHistoryNotifications += 1;
    },
  );
  store.subscribe(
    (state) => state.nodeOrder,
    () => {
      shellNotifications += 1;
    },
  );

  assert.equal(
    store.publishHistoryHeader({
      noteId: "note-child",
      versionId: "version-a",
      createdAt: 10,
      summary: "First",
    }),
    true,
  );
  assert.equal(
    store.publishHistoryHeader({
      noteId: "note-child",
      versionId: "version-a",
      createdAt: 10,
      summary: "First",
    }),
    false,
  );
  assert.deepEqual(
    store.getState().historyHeaders.get("note-child")?.map((header) => header.versionId),
    ["version-a", "version-b"],
  );
  assert.equal(childHistoryNotifications, 1);
  assert.equal(rootHistoryNotifications, 0);
  assert.equal(shellNotifications, 0);
});

test("select-all selects exactly the visible tree ids", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  store.toggleExpanded("folder");
  assert.deepEqual([...store.getState().visibleIds], ["folder", "note-root"]);
  store.selectAllTreeNodes();
  assert.deepEqual([...store.getState().selectedNodeIds].sort(), ["folder", "note-root"]);
  assert.equal(store.getState().selectionAnchorId, "folder");
  store.toggleExpanded("folder");
  assert.equal(store.getState().selectedNodeIds.has("note-child"), false);
  assert.equal(store.getState().selectedNodeIds.has("trashed"), false);
});
