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
