import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode, WorkspaceSnapshot } from "../../src/contracts/workspace";
import {
  activateTab,
  activateTabAtIndex,
  closeActiveTab,
  closeAllTabs,
  closeOtherTabs,
  closeSplit,
  closeTab,
  closeTabsToSide,
  cycleTab,
  focusPane,
  focusPaneTowards,
  moveActiveTab,
  openBeside,
  openNoteInTab,
  reopenClosedTab,
  togglePinTab,
} from "../../src/actions/panes";
import { createInitialState, createRendererStore } from "../../src/store/store";
import { PRIMARY_PANE_ID, SECONDARY_PANE_ID } from "../../src/store/panes";

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
    activeNoteId: "a",
    nodes: [
      node({ id: "a", kind: "note", rank: 1 }),
      node({ id: "b", kind: "note", rank: 2 }),
      node({ id: "c", kind: "note", rank: 3 }),
    ],
    documents: [],
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

function store() {
  return createRendererStore(createInitialState(snapshot()));
}

test("opening a note in a new tab appends it and activates it", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  const primary = rendererStore.getState().panes[0]!;
  assert.deepEqual(primary.openNoteIds, ["a", "b"]);
  assert.equal(primary.activeNoteId, "b");
  assert.equal(rendererStore.getState().activeNoteId, "b");
});

test("activating a tab makes it the store's active note", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  activateTab(rendererStore, "a");
  assert.equal(rendererStore.getState().activeNoteId, "a");
  assert.equal(rendererStore.getState().panes[0]?.activeNoteId, "a");
});

test("closing the active tab falls back to the adjacent tab", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  openNoteInTab(rendererStore, "c");
  activateTab(rendererStore, "b");
  closeTab(rendererStore, "b");
  const primary = rendererStore.getState().panes[0]!;
  assert.deepEqual(primary.openNoteIds, ["a", "c"]);
  assert.equal(primary.activeNoteId, "c");
  assert.equal(rendererStore.getState().activeNoteId, "c");
});

test("closing a background tab leaves the active note untouched", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  closeTab(rendererStore, "a");
  const primary = rendererStore.getState().panes[0]!;
  assert.deepEqual(primary.openNoteIds, ["b"]);
  assert.equal(rendererStore.getState().activeNoteId, "b");
});

test("closing the last open tab leaves no active note", () => {
  const rendererStore = store();
  closeTab(rendererStore, "a");
  const primary = rendererStore.getState().panes[0]!;
  assert.deepEqual(primary.openNoteIds, []);
  assert.equal(primary.activeNoteId, null);
  assert.equal(rendererStore.getState().activeNoteId, null);
});

test("closeActiveTab closes the split when focus is on the secondary pane", () => {
  const rendererStore = store();
  openBeside(rendererStore, "b");
  focusPane(rendererStore, SECONDARY_PANE_ID);
  closeActiveTab(rendererStore);
  assert.equal(rendererStore.getState().panes.length, 1);
  assert.equal(rendererStore.getState().focusedPaneId, PRIMARY_PANE_ID);
});

test("closeActiveTab closes the primary active tab when focus is on the primary pane", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  closeActiveTab(rendererStore);
  assert.deepEqual(rendererStore.getState().panes[0]?.openNoteIds, ["a"]);
  assert.equal(rendererStore.getState().activeNoteId, "a");
});

test("cycleTab moves the active note forward and backward through open tabs", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  openNoteInTab(rendererStore, "c");
  cycleTab(rendererStore, 1);
  assert.equal(rendererStore.getState().activeNoteId, "a");
  cycleTab(rendererStore, -1);
  assert.equal(rendererStore.getState().activeNoteId, "c");
});

test("openBeside creates the split pane when none exists", () => {
  const rendererStore = store();
  assert.equal(rendererStore.getState().panes.length, 1);
  openBeside(rendererStore, "b");
  const state = rendererStore.getState();
  assert.equal(state.panes.length, 2);
  assert.equal(state.panes[1]?.paneId, SECONDARY_PANE_ID);
  assert.equal(state.panes[1]?.activeNoteId, "b");
});

test("openBeside replaces the note shown in an already-open split", () => {
  const rendererStore = store();
  openBeside(rendererStore, "b");
  openBeside(rendererStore, "c");
  const state = rendererStore.getState();
  assert.equal(state.panes.length, 2);
  assert.equal(state.panes[1]?.activeNoteId, "c");
});

test("openBeside defaults to the active note and ignores non-note targets", () => {
  const rendererStore = store();
  openBeside(rendererStore);
  assert.equal(rendererStore.getState().panes[1]?.activeNoteId, "a");
  const before = rendererStore.getState().panes;
  openBeside(rendererStore, "missing");
  assert.equal(rendererStore.getState().panes, before);
});

test("closeSplit removes the secondary pane and refocuses the primary pane", () => {
  const rendererStore = store();
  openBeside(rendererStore, "b");
  focusPane(rendererStore, SECONDARY_PANE_ID);
  closeSplit(rendererStore);
  assert.equal(rendererStore.getState().panes.length, 1);
  assert.equal(rendererStore.getState().focusedPaneId, PRIMARY_PANE_ID);
});

test("focusPane is a no-op for an unknown pane id or the already-focused pane", () => {
  const rendererStore = store();
  const before = rendererStore.getState();
  focusPane(rendererStore, "unknown-pane");
  assert.equal(rendererStore.getState(), before);
  focusPane(rendererStore, PRIMARY_PANE_ID);
  assert.equal(rendererStore.getState(), before);
});

test("togglePinTab marks a tab pinned and excludes it from closeAllTabs", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  togglePinTab(rendererStore, "b");
  assert.deepEqual(rendererStore.getState().panes[0]?.pinnedNoteIds, ["b"]);
  closeAllTabs(rendererStore);
  assert.deepEqual(rendererStore.getState().panes[0]?.openNoteIds, ["b"]);
  assert.equal(rendererStore.getState().activeNoteId, "b");
});

test("closeOtherTabs closes every tab except the target and activates it", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  openNoteInTab(rendererStore, "c");
  closeOtherTabs(rendererStore, "b");
  const primary = rendererStore.getState().panes[0]!;
  assert.deepEqual(primary.openNoteIds, ["b"]);
  assert.equal(rendererStore.getState().activeNoteId, "b");
});

test("closeTabsToSide closes tabs on the given side of the target", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  openNoteInTab(rendererStore, "c");
  closeTabsToSide(rendererStore, "b", "right");
  const primary = rendererStore.getState().panes[0]!;
  assert.deepEqual(primary.openNoteIds, ["a", "b"]);
});

function tabbedStore() {
  const base = snapshot();
  return createRendererStore(
    createInitialState({
      ...base,
      settings: { ...base.settings, openNotesInTabs: true },
    }),
  );
}

test("tab access by index activates that slot and index 0 activates the last tab", () => {
  const rendererStore = tabbedStore();
  openNoteInTab(rendererStore, "b");
  openNoteInTab(rendererStore, "c");
  activateTabAtIndex(rendererStore, 1);
  assert.equal(rendererStore.getState().activeNoteId, "a");
  activateTabAtIndex(rendererStore, 2);
  assert.equal(rendererStore.getState().activeNoteId, "b");
  activateTabAtIndex(rendererStore, 0);
  assert.equal(rendererStore.getState().activeNoteId, "c");
});

test("tab access by index is a silent no-op out of range and with tabs off", () => {
  const tabbed = tabbedStore();
  openNoteInTab(tabbed, "b");
  const before = tabbed.getState();
  activateTabAtIndex(tabbed, 7);
  assert.equal(tabbed.getState(), before);

  const untabbed = store();
  openNoteInTab(untabbed, "b");
  const untabbedBefore = untabbed.getState();
  activateTabAtIndex(untabbed, 1);
  assert.equal(untabbed.getState(), untabbedBefore);
});

test("tab access by index reads the focused pane's strip", () => {
  const rendererStore = tabbedStore();
  openNoteInTab(rendererStore, "b");
  openBeside(rendererStore, "c");
  focusPane(rendererStore, SECONDARY_PANE_ID);
  activateTabAtIndex(rendererStore, 2);
  assert.equal(rendererStore.getState().activeNoteId, "b");
  assert.equal(rendererStore.getState().panes[1]?.activeNoteId, "c");

  focusPane(rendererStore, PRIMARY_PANE_ID);
  activateTabAtIndex(rendererStore, 1);
  assert.equal(rendererStore.getState().activeNoteId, "a");
});

test("closing a tab records it and mod+shift+w reopens it at its old position", () => {
  const rendererStore = tabbedStore();
  openNoteInTab(rendererStore, "b");
  openNoteInTab(rendererStore, "c");
  closeTab(rendererStore, "b");
  assert.deepEqual(rendererStore.getState().panes[0]?.openNoteIds, ["a", "c"]);
  assert.deepEqual(
    rendererStore.getState().closedTabsByPaneId.get(PRIMARY_PANE_ID),
    [{ noteId: "b", index: 1 }],
  );

  reopenClosedTab(rendererStore);
  assert.deepEqual(rendererStore.getState().panes[0]?.openNoteIds, ["a", "b", "c"]);
  assert.equal(rendererStore.getState().activeNoteId, "b");
  assert.equal(rendererStore.getState().closedTabsByPaneId.size, 0);
});

test("reopening skips a note trashed since it was closed", () => {
  const rendererStore = tabbedStore();
  openNoteInTab(rendererStore, "b");
  openNoteInTab(rendererStore, "c");
  closeTab(rendererStore, "b");
  closeTab(rendererStore, "c");
  rendererStore.applyOperations([{ type: "trash_subtree", rootId: "c", at: 2 }]);
  reopenClosedTab(rendererStore);
  assert.deepEqual(rendererStore.getState().panes[0]?.openNoteIds, ["a", "b"]);
  assert.equal(rendererStore.getState().activeNoteId, "b");
});

test("reopening is a silent no-op with an empty stack and with tabs off", () => {
  const tabbed = tabbedStore();
  const before = tabbed.getState();
  reopenClosedTab(tabbed);
  assert.equal(tabbed.getState(), before);

  const untabbed = store();
  openNoteInTab(untabbed, "b");
  closeTab(untabbed, "b");
  const untabbedBefore = untabbed.getState();
  reopenClosedTab(untabbed);
  assert.equal(untabbed.getState(), untabbedBefore);
});

test("closing the split forgets that pane's reopen stack", () => {
  const rendererStore = tabbedStore();
  openBeside(rendererStore, "b");
  rendererStore.update((current) => ({
    ...current,
    closedTabsByPaneId: new Map([[SECONDARY_PANE_ID, [{ noteId: "c", index: 0 }]]]),
  }));
  closeSplit(rendererStore);
  assert.equal(rendererStore.getState().closedTabsByPaneId.has(SECONDARY_PANE_ID), false);
});

test("moving the active tab wraps at the ends and needs more than one tab", () => {
  const rendererStore = tabbedStore();
  openNoteInTab(rendererStore, "b");
  openNoteInTab(rendererStore, "c");
  moveActiveTab(rendererStore, -1);
  assert.deepEqual(rendererStore.getState().panes[0]?.openNoteIds, ["a", "c", "b"]);
  moveActiveTab(rendererStore, 1);
  assert.deepEqual(rendererStore.getState().panes[0]?.openNoteIds, ["a", "b", "c"]);
  moveActiveTab(rendererStore, 1);
  assert.deepEqual(rendererStore.getState().panes[0]?.openNoteIds, ["c", "a", "b"]);

  const single = tabbedStore();
  const before = single.getState();
  moveActiveTab(single, 1);
  assert.equal(single.getState(), before);
});

test("moving a tab is a no-op with the tabbed workspace off", () => {
  const rendererStore = store();
  openNoteInTab(rendererStore, "b");
  const before = rendererStore.getState();
  moveActiveTab(rendererStore, 1);
  assert.equal(rendererStore.getState(), before);
});

test("focusPaneTowards marks the pane in that direction as focused", () => {
  const rendererStore = tabbedStore();
  openBeside(rendererStore, "b");
  assert.equal(focusPaneTowards(rendererStore, 1, 0), 1);
  assert.equal(rendererStore.getState().focusedPaneId, SECONDARY_PANE_ID);
  assert.equal(focusPaneTowards(rendererStore, -1, 1), 0);
  assert.equal(rendererStore.getState().focusedPaneId, PRIMARY_PANE_ID);
});

test("focusPaneTowards refuses to wrap and refuses to move without a split", () => {
  const rendererStore = tabbedStore();
  openBeside(rendererStore, "b");
  assert.equal(focusPaneTowards(rendererStore, -1, 0), null);
  assert.equal(focusPaneTowards(rendererStore, 1, 1), null);
  assert.equal(rendererStore.getState().focusedPaneId, PRIMARY_PANE_ID);

  closeSplit(rendererStore);
  const before = rendererStore.getState();
  assert.equal(focusPaneTowards(rendererStore, 1, null), null);
  assert.equal(rendererStore.getState(), before);
});

test("focusPaneTowards from outside the panes picks the nearest pane that way", () => {
  const rendererStore = tabbedStore();
  openBeside(rendererStore, "b");
  assert.equal(focusPaneTowards(rendererStore, 1, null), 1);
  assert.equal(rendererStore.getState().focusedPaneId, SECONDARY_PANE_ID);
  assert.equal(focusPaneTowards(rendererStore, -1, null), 0);
  assert.equal(rendererStore.getState().focusedPaneId, PRIMARY_PANE_ID);
});
