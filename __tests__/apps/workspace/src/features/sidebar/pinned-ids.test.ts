import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceNode, WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { selectPinnedIds } from "@/features/sidebar/pinned-ids";

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
      node({ id: "folder", kind: "folder", rank: 100, pinnedAt: 10 }),
      node({ id: "note-child", kind: "note", parentId: "folder", rank: 100 }),
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
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "Start writing",
    },
  };
}

test("pinned ids list the pinned nodes", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  assert.deepEqual(selectPinnedIds(store.getState()), ["folder"]);
});

test("pinned ids keep their reference while the source nodes are unchanged", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = selectPinnedIds(store.getState());
  store.setFocusedNode("note-root");
  assert.equal(selectPinnedIds(store.getState()), before);
});

test("pinning another node recomputes the ids, most recently pinned first", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = selectPinnedIds(store.getState());
  store.applyOperations([{ type: "set_node_pinned", id: "note-root", pinned: true, at: 50 }]);
  const after = selectPinnedIds(store.getState());
  assert.notEqual(after, before);
  assert.deepEqual(after, ["note-root", "folder"]);
});
