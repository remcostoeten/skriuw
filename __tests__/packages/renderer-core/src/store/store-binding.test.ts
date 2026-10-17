import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  WorkspaceNode,
  WorkspaceSnapshot,
} from "../../../../../packages/renderer-core/src/contracts/workspace";
import {
  createInitialState,
  createRendererStore,
} from "../../../../../packages/renderer-core/src/store/store";
import type { RendererState } from "../../../../../packages/renderer-core/src/store/types";

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

function countingActiveNoteSelector() {
  const calls = { count: 0 };
  function selectActiveNoteId(state: RendererState) {
    calls.count += 1;
    return state.activeNoteId;
  }
  return { calls, selectActiveNoteId };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

test("a binding runs its selector once while the state is unchanged", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const { calls, selectActiveNoteId } = countingActiveNoteSelector();
  const binding = store.createBinding(selectActiveNoteId);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(binding.getSnapshot(), "note-child");
  }
  assert.equal(calls.count, 1);
});

test("a binding recomputes once after the state changes", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const { calls, selectActiveNoteId } = countingActiveNoteSelector();
  const binding = store.createBinding(selectActiveNoteId);
  binding.getSnapshot();
  const before = calls.count;
  assert.equal(store.setActiveNote("note-root"), true);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(binding.getSnapshot(), "note-root");
  }
  assert.equal(calls.count, before + 1);
});

test("a binding keeps the previous reference when equality holds across an update", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const binding = store.createBinding((state) => [...state.nodeOrder], sameIds);
  const first = binding.getSnapshot();
  assert.equal(store.setFocusedNode("note-root"), true);
  const second = binding.getSnapshot();
  assert.equal(first, second);
});

test("a no-op update keeps the binding's cached selection", () => {
  const store = createRendererStore(createInitialState(snapshot()));
  const { calls, selectActiveNoteId } = countingActiveNoteSelector();
  const binding = store.createBinding(selectActiveNoteId);
  binding.getSnapshot();
  const before = calls.count;
  store.update((state) => state);
  binding.getSnapshot();
  binding.getSnapshot();
  assert.equal(calls.count, before);
});
