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

test("renameNode publishes the new title before leaving rename mode", async () => {
  const { renameNode } = await import("@/features/notes/operations");
  const store = await storeWith({ activeNoteId: "a", nodes: [noteNode("a", 1)] });
  const transitions: string[] = [];
  store.setEditingNode("a");
  store.subscribe(
    (state) => `${state.nodes.get("a")?.title ?? ""}:${state.editingNodeId ?? ""}`,
    () => {
      const state = store.getState();
      transitions.push(`${state.nodes.get("a")?.title ?? ""}:${state.editingNodeId ?? ""}`);
    },
  );

  renameNode(store, "a", "Renamed");

  assert.deepEqual(transitions, ["Renamed:a", "Renamed:"]);
  assert.equal(store.getState().nodes.get("a")?.title, "Renamed");
  assert.equal(store.getState().editingNodeId, null);
});
