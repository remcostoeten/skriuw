import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  WorkspaceNode,
  WorkspaceSnapshot,
} from "../../../../../../packages/renderer-core/src/contracts/workspace";
import {
  createInitialState,
  createRendererStore,
} from "../../../../../../packages/renderer-core/src/store/store";
import { sameNoteNavigation, selectNoteNavigation } from "@/shell/title-bar/note-navigation";

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
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "Start writing",
    },
  };
}

test("renaming the active note keeps the navigation snapshot equal", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = selectNoteNavigation(store.getState());
  store.update((state) => {
    const metadata = new Map(state.metadata);
    const current = metadata.get("note-child");
    assert.ok(current);
    metadata.set("note-child", { ...current, title: "Renamed child" });
    return { ...state, metadata };
  });
  assert.equal(store.getState().metadata.get("note-child")?.title, "Renamed child");
  const after = selectNoteNavigation(store.getState());
  assert.equal(sameNoteNavigation(before, after), true);
});

test("switching the active note changes the navigation snapshot", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const before = selectNoteNavigation(store.getState());
  store.setActiveNote("note-root");
  const after = selectNoteNavigation(store.getState());
  assert.equal(sameNoteNavigation(before, after), false);
  assert.equal(after[2], "note-root");
});

test("no active note yields an empty navigation snapshot", () => {
  const store = createRendererStore(createInitialState({ ...snapshot(), activeNoteId: null }));
  store.setActiveNote(null);
  assert.deepEqual(selectNoteNavigation(store.getState()), [null, null, null]);
});
