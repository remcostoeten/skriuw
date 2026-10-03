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

test("renameCurrentNote starts the inline rename of the open note", async () => {
  const { renameCurrentNote } = await import("@/features/sidebar/tree-state");
  const store = await storeWith({
    activeNoteId: "child",
    nodes: [folderNode("folder", 1), noteNode("child", 1, "folder")],
  });
  store.update((current) => ({ ...current, expandedIds: new Set<string>() }));

  assert.equal(renameCurrentNote(store), true);
  assert.equal(store.getState().editingNodeId, "child");
  assert.equal(store.getState().focusedNodeId, "child");
  assert.equal(store.getState().expandedIds.has("folder"), true);
  assert.equal(store.getState().visibleIds.includes("child"), true);
});

test("renameCurrentNote keeps an in-progress rename and no-ops without a note", async () => {
  const { renameCurrentNote } = await import("@/features/sidebar/tree-state");
  const store = await storeWith({ activeNoteId: "a", nodes: [noteNode("a", 1)] });
  assert.equal(renameCurrentNote(store), true);
  assert.equal(renameCurrentNote(store), true);
  assert.equal(store.getState().editingNodeId, "a");

  const empty = await storeWith({ activeNoteId: null, nodes: [] });
  assert.equal(renameCurrentNote(empty), false);
  assert.equal(empty.getState().editingNodeId, null);
});
