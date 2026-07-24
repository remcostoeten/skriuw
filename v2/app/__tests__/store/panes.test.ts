import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode } from "../../src/contracts/workspace";
import {
  PRIMARY_PANE_ID,
  SECONDARY_PANE_ID,
  closeSplit,
  closeTab,
  cycleTabId,
  defaultPanes,
  openBeside,
  openNoteInTab,
  parsePaneLayout,
  serializePaneLayout,
  syncPanes,
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

function primary(openNoteIds: string[], activeNoteId: string | null): PaneState {
  return { paneId: PRIMARY_PANE_ID, openNoteIds, activeNoteId };
}

test("defaultPanes with no active note opens a single empty primary pane", () => {
  const panes = defaultPanes(null);
  assert.deepEqual(panes, [{ paneId: PRIMARY_PANE_ID, openNoteIds: [], activeNoteId: null }]);
});

test("defaultPanes with an active note opens it as the sole tab", () => {
  const panes = defaultPanes("a");
  assert.deepEqual(panes, [{ paneId: PRIMARY_PANE_ID, openNoteIds: ["a"], activeNoteId: "a" }]);
});

test("sync replaces the primary active tab in place for ordinary navigation", () => {
  const nodes = nodeMap(node("a"), node("b"), node("c"));
  const panes = [primary(["a", "b"], "a")];
  const synced = syncPanes(panes, "c", nodes);
  assert.deepEqual(synced[0]?.openNoteIds, ["c", "b"]);
  assert.equal(synced[0]?.activeNoteId, "c");
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
    { paneId: SECONDARY_PANE_ID, openNoteIds: ["gone"], activeNoteId: "gone" },
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
    parsePaneLayout(JSON.stringify({ version: 1, panes: [{ paneId: 7 }] })),
    null,
  );
  assert.equal(parsePaneLayout(serializePaneLayout(defaultPanes(null)))?.length, 1);
});
