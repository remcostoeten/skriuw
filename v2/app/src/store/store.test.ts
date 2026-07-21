import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../contracts/workspace";
import { createInitialState, createRendererStore } from "./store";

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
