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

test("navigateNote walks sidebar order and wraps at both ends", async () => {
  const { createInitialState, createRendererStore } =
    await import("@skriuw/renderer-core/store/store");
  const { navigateNote } = await import("@/features/notes/navigation");
  const base = {
    protocolVersion: 1,
    activeNoteId: "a",
    nodes: [
      {
        id: "a",
        kind: "note",
        parentId: null,
        rank: 1,
        title: "a",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
      {
        id: "b",
        kind: "note",
        parentId: null,
        rank: 2,
        title: "b",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
      {
        id: "c",
        kind: "note",
        parentId: null,
        rank: 3,
        title: "c",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
    ],
    documents: [],
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
      editorPlaceholder: "",
    },
  };
  const store = createRendererStore(createInitialState(base as never));

  navigateNote(store, 1);
  assert.equal(store.getState().activeNoteId, "b");
  navigateNote(store, -1);
  navigateNote(store, -1);
  assert.equal(store.getState().activeNoteId, "c");
  navigateNote(store, 1);
  assert.equal(store.getState().activeNoteId, "a");
});

test("navigateNote follows the focused pane's tab order when notes open in tabs", async () => {
  const { createInitialState, createRendererStore } =
    await import("@skriuw/renderer-core/store/store");
  const { navigateNote } = await import("@/features/notes/navigation");
  const { openNoteInTab } = await import("@/features/workspace-layout/panes");
  const base = {
    protocolVersion: 1,
    activeNoteId: "a",
    nodes: [
      {
        id: "a",
        kind: "note",
        parentId: null,
        rank: 1,
        title: "a",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
      {
        id: "b",
        kind: "note",
        parentId: null,
        rank: 2,
        title: "b",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
      {
        id: "c",
        kind: "note",
        parentId: null,
        rank: 3,
        title: "c",
        icon: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        pinnedAt: null,
      },
    ],
    documents: [],
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
      editorPlaceholder: "",
      openNotesInTabs: true,
    },
  };
  const store = createRendererStore(createInitialState(base as never));
  openNoteInTab(store, "c");

  navigateNote(store, 1);
  assert.equal(store.getState().activeNoteId, "a");
  navigateNote(store, -1);
  assert.equal(store.getState().activeNoteId, "c");
});

test("navigateNote is a no-op without an active note", async () => {
  const { createInitialState, createRendererStore } =
    await import("@skriuw/renderer-core/store/store");
  const { navigateNote } = await import("@/features/notes/navigation");
  const base = {
    protocolVersion: 1,
    activeNoteId: null,
    nodes: [],
    documents: [],
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
      editorPlaceholder: "",
    },
  };
  const store = createRendererStore(createInitialState(base as never));
  navigateNote(store, 1);
  assert.equal(store.getState().activeNoteId, null);
});

test("focusedPaneNoteId falls back to the active note and rejects folders", async () => {
  const { focusedPaneNoteId } = await import("@/features/notes/navigation");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), folderNode("f", 2)],
  });
  assert.equal(focusedPaneNoteId(store.getState()), "a");

  const empty = await storeWith({ activeNoteId: null, nodes: [] });
  assert.equal(focusedPaneNoteId(empty.getState()), null);
});

test("focusedPaneNoteId follows the focused pane in a split", async () => {
  const { focusedPaneNoteId } = await import("@/features/notes/navigation");
  const { focusPane, openBeside } = await import("@/features/workspace-layout/panes");
  const { SECONDARY_PANE_ID } = await import("@skriuw/renderer-core/store/panes");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), noteNode("b", 2)],
  });
  openBeside(store, "b");
  focusPane(store, SECONDARY_PANE_ID);
  assert.equal(focusedPaneNoteId(store.getState()), "b");
});

test("nextNoteAfterRemoval prefers the successor and falls back to the predecessor", async () => {
  const { nextNoteAfterRemoval } = await import("@/features/notes/navigation");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), noteNode("b", 2), noteNode("c", 3)],
  });
  const state = store.getState();
  assert.equal(nextNoteAfterRemoval(state, "a"), "b");
  assert.equal(nextNoteAfterRemoval(state, "c"), "b");
  assert.equal(nextNoteAfterRemoval(state, "missing"), null);
});
