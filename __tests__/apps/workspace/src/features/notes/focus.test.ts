import assert from "node:assert/strict";
import { test } from "vitest";
import { setupTauriInvokeStub } from "../../shared/tauri-stub";

setupTauriInvokeStub();

const NOTE_SETTINGS = {
  settingsVersion: 1,
  theme: "system",
  compactSidebar: false,
  showPageIcons: true,
  rememberLastNote: true,
  editorFont: "sans",
  editorLineHeight: "1.6",
  showLineNumbers: false,
  editorPlaceholder: "",
};

function noteNode(id: string, rank: number, parentId: string | null = null) {
  return {
    id,
    kind: "note",
    parentId,
    rank,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
  };
}

function folderNode(id: string, rank: number, parentId: string | null = null) {
  return { ...noteNode(id, rank, parentId), kind: "folder" };
}

async function storeWith(snapshot: Record<string, unknown>) {
  const { createInitialState, createRendererStore } =
    await import("@skriuw/renderer-core/store/store");
  return createRendererStore(
    createInitialState({
      protocolVersion: 1,
      documents: [],
      historyHeaders: [],
      settings: NOTE_SETTINGS,
      ...snapshot,
    } as never),
  );
}

test("focusedFolderId reads the sidebar's focused row, only when it's a folder", async () => {
  const { focusedFolderId } = await import("@/features/notes/focus");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), folderNode("f", 2)],
  });

  store.setFocusedNode("f");
  assert.equal(focusedFolderId(store.getState()), "f");

  store.setFocusedNode("a");
  assert.equal(focusedFolderId(store.getState()), null);

  store.setFocusedNode(null);
  assert.equal(focusedFolderId(store.getState()), null);
});

test("focusedTreeNoteId reads the sidebar's focused row, only when it's a note", async () => {
  const { focusedTreeNoteId } = await import("@/features/notes/focus");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), folderNode("f", 2)],
  });

  store.setFocusedNode("a");
  assert.equal(focusedTreeNoteId(store.getState()), "a");

  store.setFocusedNode("f");
  assert.equal(focusedTreeNoteId(store.getState()), null);

  store.setFocusedNode(null);
  assert.equal(focusedTreeNoteId(store.getState()), null);
});
