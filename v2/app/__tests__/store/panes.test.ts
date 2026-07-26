import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode } from "../../src/contracts/workspace";
import {
  PANE_LAYOUT_VERSION,
  PRIMARY_PANE_ID,
  SECONDARY_PANE_ID,
  activateTabInPane,
  closeAllTabs,
  closeOtherTabs,
  closeSplit,
  closeTab,
  closeTabsToSide,
  cycleTabId,
  defaultPanes,
  openBeside,
  openNoteInTab,
  parsePaneLayout,
  reorderTab,
  serializePaneLayout,
  syncPanes,
  tabIdAtIndex,
  togglePinTab,
} from "../../src/store/panes";
import type { PaneState } from "../../src/store/panes";

function node(id: string, kind: "note" | "folder" = "note"): WorkspaceNode {
  return {
    id,
    kind,
    parentId: null,
    rank: 0,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
  };
}

function nodeMap(...nodes: WorkspaceNode[]): Map<string, WorkspaceNode> {
  return new Map(nodes.map((entry) => [entry.id, entry]));
}

function primary(
  openNoteIds: string[],
  activeNoteId: string | null,
  pinnedNoteIds: string[] = [],
): PaneState {
  return { paneId: PRIMARY_PANE_ID, openNoteIds, pinnedNoteIds, activeNoteId };
}

test("defaultPanes with no active note opens a single empty primary pane", () => {
  const panes = defaultPanes(null);
  assert.deepEqual(panes, [
    { paneId: PRIMARY_PANE_ID, openNoteIds: [], pinnedNoteIds: [], activeNoteId: null },
  ]);
});

test("defaultPanes with an active note opens it as the sole tab", () => {
  const panes = defaultPanes("a");
  assert.deepEqual(panes, [
    { paneId: PRIMARY_PANE_ID, openNoteIds: ["a"], pinnedNoteIds: [], activeNoteId: "a" },
  ]);
});

test("sync replaces the primary active tab in place for ordinary navigation", () => {
  const nodes = nodeMap(node("a"), node("b"), node("c"));
  const panes = [primary(["a", "b"], "a")];
  const synced = syncPanes(panes, "c", nodes);
  assert.deepEqual(synced[0]?.openNoteIds, ["c", "b"]);
  assert.equal(synced[0]?.activeNoteId, "c");
});

test("sync appends a new tab for ordinary navigation when openInTabs is set", () => {
  const nodes = nodeMap(node("a"), node("b"), node("c"));
  const panes = [primary(["a", "b"], "a")];
  const synced = syncPanes(panes, "c", nodes, true);
  assert.deepEqual(synced[0]?.openNoteIds, ["a", "b", "c"]);
  assert.equal(synced[0]?.activeNoteId, "c");
});

test("sync with openInTabs activates an already-open note without duplicating tabs", () => {
  const nodes = nodeMap(node("a"), node("b"));
  const panes = [primary(["a", "b"], "a")];
  const synced = syncPanes(panes, "b", nodes, true);
  assert.deepEqual(synced[0]?.openNoteIds, ["a", "b"]);
  assert.equal(synced[0]?.activeNoteId, "b");
});

test("sync appends when the previous active tab is not in the strip", () => {
  const nodes = nodeMap(node("a"), node("b"));
  const panes = [primary(["a"], null)];
  const synced = syncPanes(panes, "b", nodes);
  assert.deepEqual(synced[0]?.openNoteIds, ["a", "b"]);
});

test("sync keeps already-open notes without duplicating tabs", () => {
  const nodes = nodeMap(node("a"), node("b"));
  const panes = [primary(["a", "b"], "a")];
  const synced = syncPanes(panes, "b", nodes);
  assert.deepEqual(synced[0]?.openNoteIds, ["a", "b"]);
  assert.equal(synced[0]?.activeNoteId, "b");
});

test("sync returns the same reference when nothing changes", () => {
  const nodes = nodeMap(node("a"), node("b"));
  const panes = [primary(["a", "b"], "a")];
  assert.equal(syncPanes(panes, "a", nodes), panes);
});

test("sync drops purged notes from every pane and nulls a purged secondary note", () => {
  const nodes = nodeMap(node("a"));
  const panes: PaneState[] = [
    primary(["a", "gone"], "a"),
    { paneId: SECONDARY_PANE_ID, openNoteIds: ["gone"], pinnedNoteIds: [], activeNoteId: "gone" },
  ];
  const synced = syncPanes(panes, "a", nodes);
  assert.deepEqual(synced[0]?.openNoteIds, ["a"]);
  assert.deepEqual(synced[1]?.openNoteIds, []);
  assert.equal(synced[1]?.activeNoteId, null);
});

test("open in new tab appends once and keeps existing tabs", () => {
  const panes = [primary(["a"], "a")];
  const once = openNoteInTab(panes, "b");
  assert.deepEqual(once[0]?.openNoteIds, ["a", "b"]);
  const twice = openNoteInTab(once, "b");
  assert.deepEqual(twice[0]?.openNoteIds, ["a", "b"]);
});

test("closing the active tab promotes the nearest neighbor", () => {
  const panes = [primary(["a", "b", "c"], "b")];
  const result = closeTab(panes, "b");
  assert.deepEqual(result.panes[0]?.openNoteIds, ["a", "c"]);
  assert.equal(result.nextActiveNoteId, "c");

  const last = closeTab([primary(["a"], "a")], "a");
  assert.equal(last.nextActiveNoteId, null);
  assert.deepEqual(last.panes[0]?.openNoteIds, []);
});

test("closing a background tab never changes the active note", () => {
  const panes = [primary(["a", "b"], "a")];
  const result = closeTab(panes, "b");
  assert.equal(result.nextActiveNoteId, undefined);
  assert.equal(result.panes[0]?.activeNoteId, "a");
});

test("tab cycling wraps in both directions", () => {
  const panes = [primary(["a", "b", "c"], "c")];
  assert.equal(cycleTabId(panes, 1), "a");
  assert.equal(cycleTabId(panes, -1), "b");
  assert.equal(cycleTabId([primary(["a"], "a")], 1), null);
});

test("open beside creates the secondary pane and close split removes it", () => {
  const panes = openBeside([primary(["a"], "a")], "a");
  assert.equal(panes.length, 2);
  assert.equal(panes[1]?.paneId, SECONDARY_PANE_ID);
  assert.equal(panes[1]?.activeNoteId, "a");
  const closed = closeSplit(panes);
  assert.equal(closed.length, 1);
  assert.equal(closeSplit(closed), closed);
});

test("pane layout survives a serialize/parse round trip", () => {
  const panes = openBeside([primary(["a", "b"], "a")], "b");
  const parsed = parsePaneLayout(serializePaneLayout(panes));
  assert.deepEqual(parsed, panes);
});

test("parse rejects malformed, versionless, and foreign payloads", () => {
  assert.equal(parsePaneLayout(null), null);
  assert.equal(parsePaneLayout("not json"), null);
  assert.equal(parsePaneLayout("{}"), null);
  assert.equal(parsePaneLayout(JSON.stringify({ version: 99, panes: [] })), null);
  assert.equal(
    parsePaneLayout(JSON.stringify({ version: PANE_LAYOUT_VERSION, panes: [{ paneId: 7 }] })),
    null,
  );
  assert.equal(parsePaneLayout(serializePaneLayout(defaultPanes(null)))?.length, 1);
});

test("togglePinTab pins and unpins an open tab, and ignores unknown tabs", () => {
  const panes = [primary(["a", "b"], "a")];
  const pinned = togglePinTab(panes, "b");
  assert.deepEqual(pinned[0]?.pinnedNoteIds, ["b"]);
  const unpinned = togglePinTab(pinned, "b");
  assert.deepEqual(unpinned[0]?.pinnedNoteIds, []);
  assert.equal(togglePinTab(panes, "missing"), panes);
});

test("reorderTab moves an unpinned tab before another tab or to the end", () => {
  const panes = [primary(["a", "b", "c"], "a")];
  assert.deepEqual(reorderTab(panes, "c", "b")[0]?.openNoteIds, ["a", "c", "b"]);
  assert.deepEqual(reorderTab(panes, "a", null)[0]?.openNoteIds, ["b", "c", "a"]);
});

test("reorderTab refuses to move pinned tabs or to displace them", () => {
  const panes = [primary(["a", "b", "c"], "a", ["a"])];
  assert.equal(reorderTab(panes, "a", "c"), panes);
  assert.equal(reorderTab(panes, "c", "a"), panes);
  assert.deepEqual(reorderTab(panes, "c", "b")[0]?.openNoteIds, ["a", "c", "b"]);
});

test("reorderTab is a no-op for unknown tabs and unchanged positions", () => {
  const panes = [primary(["a", "b"], "a")];
  assert.equal(reorderTab(panes, "missing", "a"), panes);
  assert.equal(reorderTab(panes, "a", "missing"), panes);
  assert.equal(reorderTab(panes, "a", "a"), panes);
  assert.equal(reorderTab(panes, "a", "b"), panes);
});

test("closeOtherTabs keeps the target and pinned tabs, promoting the target when active is removed", () => {
  const panes = [primary(["a", "b", "c"], "a", ["c"])];
  const result = closeOtherTabs(panes, "b");
  assert.deepEqual(result.panes[0]?.openNoteIds, ["b", "c"]);
  assert.equal(result.nextActiveNoteId, "b");
});

test("closeOtherTabs is a no-op when nothing would be removed", () => {
  const panes = [primary(["a"], "a")];
  const result = closeOtherTabs(panes, "a");
  assert.equal(result.panes, panes);
  assert.equal(result.nextActiveNoteId, undefined);
});

test("closeTabsToSide removes unpinned tabs on the given side but keeps the anchor and pinned tabs", () => {
  const panes = [primary(["a", "b", "c", "d"], "d", ["a"])];
  const right = closeTabsToSide(panes, "b", "right");
  assert.deepEqual(right.panes[0]?.openNoteIds, ["a", "b"]);
  assert.equal(right.nextActiveNoteId, "b");

  const left = closeTabsToSide(panes, "c", "left");
  assert.deepEqual(left.panes[0]?.openNoteIds, ["a", "c", "d"]);
  assert.equal(left.nextActiveNoteId, undefined);
});

test("closeAllTabs keeps only pinned tabs and promotes a survivor when the active tab closes", () => {
  const panes = [primary(["a", "b", "c"], "b", ["c"])];
  const result = closeAllTabs(panes);
  assert.deepEqual(result.panes[0]?.openNoteIds, ["c"]);
  assert.equal(result.nextActiveNoteId, "c");
});

test("tabIdAtIndex resolves 1-based slots and treats 0 as the last tab", () => {
  const panes = [primary(["a", "b", "c"], "a")];
  assert.equal(tabIdAtIndex(panes, PRIMARY_PANE_ID, 1), "a");
  assert.equal(tabIdAtIndex(panes, PRIMARY_PANE_ID, 3), "c");
  assert.equal(tabIdAtIndex(panes, PRIMARY_PANE_ID, 0), "c");
  assert.equal(tabIdAtIndex(panes, PRIMARY_PANE_ID, 4), null);
  assert.equal(tabIdAtIndex(panes, PRIMARY_PANE_ID, -1), null);
  assert.equal(tabIdAtIndex([primary([], null)], PRIMARY_PANE_ID, 0), null);
});

test("tabIdAtIndex reads the requested pane and falls back to the primary one", () => {
  const panes = [
    primary(["a", "b"], "a"),
    { paneId: SECONDARY_PANE_ID, openNoteIds: ["c"], pinnedNoteIds: [], activeNoteId: "c" },
  ];
  assert.equal(tabIdAtIndex(panes, SECONDARY_PANE_ID, 1), "c");
  assert.equal(tabIdAtIndex(panes, SECONDARY_PANE_ID, 2), null);
  assert.equal(tabIdAtIndex(panes, "unknown-pane", 2), "b");
});

test("activateTabInPane switches the split pane's tab and ignores unknown notes", () => {
  const panes = [
    primary(["a"], "a"),
    { paneId: SECONDARY_PANE_ID, openNoteIds: ["b", "c"], pinnedNoteIds: [], activeNoteId: "b" },
  ];
  const next = activateTabInPane(panes, SECONDARY_PANE_ID, "c");
  assert.equal(next[1]?.activeNoteId, "c");
  assert.equal(next[0], panes[0]);
  assert.equal(activateTabInPane(panes, SECONDARY_PANE_ID, "b"), panes);
  assert.equal(activateTabInPane(panes, SECONDARY_PANE_ID, "a"), panes);
  assert.equal(activateTabInPane(panes, "unknown-pane", "b"), panes);
});
