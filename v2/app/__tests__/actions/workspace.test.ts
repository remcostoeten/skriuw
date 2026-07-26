import assert from "node:assert/strict";
import test from "node:test";
import * as workspaceActions from "../../src/actions/workspace";

test("workspace action exports exist and are functions", () => {
  assert.equal(typeof workspaceActions.commitReferenceOperations, "function");
  assert.equal(typeof workspaceActions.commitOperations, "function");
  assert.equal(typeof workspaceActions.createNote, "function");
  assert.equal(typeof workspaceActions.createLinkedNote, "function");
  assert.equal(typeof workspaceActions.createFolder, "function");
  assert.equal(typeof workspaceActions.renameNode, "function");
  assert.equal(typeof workspaceActions.trashSubtree, "function");
  assert.equal(typeof workspaceActions.trashSubtrees, "function");
  assert.equal(typeof workspaceActions.restoreSubtree, "function");
  assert.equal(typeof workspaceActions.purgeSubtree, "function");
  assert.equal(typeof workspaceActions.emptyTrash, "function");
  assert.equal(typeof workspaceActions.moveNode, "function");
  assert.equal(typeof workspaceActions.moveNodes, "function");
  assert.equal(typeof workspaceActions.restoreNoteVersion, "function");
  assert.equal(typeof workspaceActions.activateNote, "function");
});

test("navigateNote walks sidebar order and wraps at both ends", async () => {
  const { createInitialState, createRendererStore } = await import("../../src/store/store");
  const { navigateNote } = await import("../../src/actions/workspace");
  const base = {
    protocolVersion: 1,
    activeNoteId: "a",
    nodes: [
      { id: "a", kind: "note", parentId: null, rank: 1, title: "a", icon: null, createdAt: 1, updatedAt: 1, deletedAt: null, pinnedAt: null },
      { id: "b", kind: "note", parentId: null, rank: 2, title: "b", icon: null, createdAt: 1, updatedAt: 1, deletedAt: null, pinnedAt: null },
      { id: "c", kind: "note", parentId: null, rank: 3, title: "c", icon: null, createdAt: 1, updatedAt: 1, deletedAt: null, pinnedAt: null },
    ],
    documents: [],
    historyHeaders: [],
    settings: { settingsVersion: 1, theme: "system", compactSidebar: false, showPageIcons: true, reduceMotion: false, rememberLastNote: true, editorFont: "sans", editorLineHeight: "1.6", showLineNumbers: false, editorPlaceholder: "" },
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
  const { createInitialState, createRendererStore } = await import("../../src/store/store");
  const { navigateNote } = await import("../../src/actions/workspace");
  const { openNoteInTab } = await import("../../src/actions/panes");
  const base = {
    protocolVersion: 1,
    activeNoteId: "a",
    nodes: [
      { id: "a", kind: "note", parentId: null, rank: 1, title: "a", icon: null, createdAt: 1, updatedAt: 1, deletedAt: null, pinnedAt: null },
      { id: "b", kind: "note", parentId: null, rank: 2, title: "b", icon: null, createdAt: 1, updatedAt: 1, deletedAt: null, pinnedAt: null },
      { id: "c", kind: "note", parentId: null, rank: 3, title: "c", icon: null, createdAt: 1, updatedAt: 1, deletedAt: null, pinnedAt: null },
    ],
    documents: [],
    historyHeaders: [],
    settings: { settingsVersion: 1, theme: "system", compactSidebar: false, showPageIcons: true, reduceMotion: false, rememberLastNote: true, editorFont: "sans", editorLineHeight: "1.6", showLineNumbers: false, editorPlaceholder: "", openNotesInTabs: true },
  };
  const store = createRendererStore(createInitialState(base as never));
  openNoteInTab(store, "c");

  navigateNote(store, 1);
  assert.equal(store.getState().activeNoteId, "a");
  navigateNote(store, -1);
  assert.equal(store.getState().activeNoteId, "c");
});

test("navigateNote is a no-op without an active note", async () => {
  const { createInitialState, createRendererStore } = await import("../../src/store/store");
  const { navigateNote } = await import("../../src/actions/workspace");
  const base = {
    protocolVersion: 1,
    activeNoteId: null,
    nodes: [],
    documents: [],
    historyHeaders: [],
    settings: { settingsVersion: 1, theme: "system", compactSidebar: false, showPageIcons: true, reduceMotion: false, rememberLastNote: true, editorFont: "sans", editorLineHeight: "1.6", showLineNumbers: false, editorPlaceholder: "" },
  };
  const store = createRendererStore(createInitialState(base as never));
  navigateNote(store, 1);
  assert.equal(store.getState().activeNoteId, null);
});

const NOTE_SETTINGS = {
  settingsVersion: 1,
  theme: "system",
  compactSidebar: false,
  showPageIcons: true,
  reduceMotion: false,
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
  const { createInitialState, createRendererStore } = await import("../../src/store/store");
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

test("focusedPaneNoteId falls back to the active note and rejects folders", async () => {
  const { focusedPaneNoteId } = await import("../../src/actions/workspace");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), folderNode("f", 2)],
  });
  assert.equal(focusedPaneNoteId(store.getState()), "a");

  const empty = await storeWith({ activeNoteId: null, nodes: [] });
  assert.equal(focusedPaneNoteId(empty.getState()), null);
});

test("focusedPaneNoteId follows the focused pane in a split", async () => {
  const { focusedPaneNoteId } = await import("../../src/actions/workspace");
  const { focusPane, openBeside } = await import("../../src/actions/panes");
  const { SECONDARY_PANE_ID } = await import("../../src/store/panes");
  const store = await storeWith({
    activeNoteId: "a",
    nodes: [noteNode("a", 1), noteNode("b", 2)],
  });
  openBeside(store, "b");
  focusPane(store, SECONDARY_PANE_ID);
  assert.equal(focusedPaneNoteId(store.getState()), "b");
});

test("renameCurrentNote starts the inline rename of the open note", async () => {
  const { renameCurrentNote } = await import("../../src/actions/workspace");
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
  const { renameCurrentNote } = await import("../../src/actions/workspace");
  const store = await storeWith({ activeNoteId: "a", nodes: [noteNode("a", 1)] });
  assert.equal(renameCurrentNote(store), true);
  assert.equal(renameCurrentNote(store), true);
  assert.equal(store.getState().editingNodeId, "a");

  const empty = await storeWith({ activeNoteId: null, nodes: [] });
  assert.equal(renameCurrentNote(empty), false);
  assert.equal(empty.getState().editingNodeId, null);
});
