import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode } from "../../src/contracts/workspace";
import {
  CLOSED_TAB_LIMIT,
  DEFAULT_SPLIT_ORIENTATION,
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  PANE_LAYOUT_VERSION,
  PRIMARY_PANE_ID,
  SECONDARY_PANE_ID,
  activateTabInPane,
  closeAllTabs,
  closeOtherTabs,
  clampSplitRatio,
  closePane,
  closeTab,
  closeTabsToSide,
  cycleTabId,
  defaultPanes,
  discardClosedTabs,
  moveTabInPane,
  openBeside,
  openNoteInTab,
  paneIndexCycling,
  paneIndexInDirection,
  parsePaneLayout,
  recordClosedTab,
  reopenClosedTab,
  reorderTab,
  restorePanes,
  serializePaneLayout,
  syncPanes,
  tabIdAtIndex,
  togglePinTab,
  withClosedTabs,
} from "../../src/store/panes";
import type { ClosedTabStacks, PaneLayout, PaneState } from "../../src/store/panes";

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

function layoutOf(panes: readonly PaneState[]): PaneLayout {
  return { panes, orientation: DEFAULT_SPLIT_ORIENTATION, ratio: DEFAULT_SPLIT_RATIO };
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

test("restore drops unavailable tabs and an empty secondary pane", () => {
  const trashed = { ...node("trashed"), deletedAt: 10 };
  const trashedFolder = { ...node("folder", "folder"), deletedAt: 10 };
  const inheritedTrash = { ...node("nested"), parentId: "folder" };
  const nodes = nodeMap(node("a"), trashed, trashedFolder, inheritedTrash);
  const panes: PaneState[] = [
    primary(["trashed", "nested", "a"], "trashed", ["trashed"]),
    {
      paneId: SECONDARY_PANE_ID,
      openNoteIds: ["nested"],
      pinnedNoteIds: [],
      activeNoteId: "nested",
    },
  ];

  const restored = restorePanes(panes, "a", nodes, true);

  assert.deepEqual(restored, [primary(["a"], "a")]);
});

test("restore produces an empty primary pane when no available notes remain", () => {
  const trashed = { ...node("trashed"), deletedAt: 10 };
  const restored = restorePanes(
    [primary(["trashed"], "trashed", ["trashed"])],
    null,
    nodeMap(trashed),
  );

  assert.deepEqual(restored, [primary([], null)]);
});

test("open in new tab appends once and keeps existing tabs", () => {
  const panes = [primary(["a"], "a")];
  const once = openNoteInTab(panes, PRIMARY_PANE_ID, "b");
  assert.deepEqual(once[0]?.openNoteIds, ["a", "b"]);
  const twice = openNoteInTab(once, PRIMARY_PANE_ID, "b");
  assert.deepEqual(twice[0]?.openNoteIds, ["a", "b"]);
});

test("closing the active tab promotes the nearest neighbor", () => {
  const panes = [primary(["a", "b", "c"], "b")];
  const result = closeTab(panes, PRIMARY_PANE_ID, "b");
  assert.deepEqual(result.panes[0]?.openNoteIds, ["a", "c"]);
  assert.equal(result.nextActiveNoteId, "c");

  const last = closeTab([primary(["a"], "a")], PRIMARY_PANE_ID, "a");
  assert.equal(last.nextActiveNoteId, null);
  assert.deepEqual(last.panes[0]?.openNoteIds, []);
});

test("closing a background tab never changes the active note", () => {
  const panes = [primary(["a", "b"], "a")];
  const result = closeTab(panes, PRIMARY_PANE_ID, "b");
  assert.equal(result.nextActiveNoteId, undefined);
  assert.equal(result.panes[0]?.activeNoteId, "a");
});

test("tab cycling wraps in both directions", () => {
  const panes = [primary(["a", "b", "c"], "c")];
  assert.equal(cycleTabId(panes, PRIMARY_PANE_ID, 1), "a");
  assert.equal(cycleTabId(panes, PRIMARY_PANE_ID, -1), "b");
  assert.equal(cycleTabId([primary(["a"], "a")], PRIMARY_PANE_ID, 1), null);
});

test("open beside creates the secondary pane and closing it leaves the primary one", () => {
  const panes = openBeside([primary(["a"], "a")], "a");
  assert.equal(panes.length, 2);
  assert.equal(panes[1]?.paneId, SECONDARY_PANE_ID);
  assert.equal(panes[1]?.activeNoteId, "a");
  const closed = closePane(panes, SECONDARY_PANE_ID);
  assert.deepEqual(closed.panes, [primary(["a"], "a")]);
  assert.equal(closed.nextActiveNoteId, undefined);
  assert.equal(closed.promotedFromPaneId, null);
});

test("closing the primary pane promotes the survivor and its active note", () => {
  const panes = openBeside([primary(["a"], "a")], "b");
  const closed = closePane(panes, PRIMARY_PANE_ID);
  assert.deepEqual(closed.panes, [primary(["b"], "b")]);
  assert.equal(closed.nextActiveNoteId, "b");
  assert.equal(closed.promotedFromPaneId, SECONDARY_PANE_ID);
});

test("closing a pane is a no-op without a split and for an unknown pane", () => {
  const single = [primary(["a"], "a")];
  assert.equal(closePane(single, PRIMARY_PANE_ID).panes, single);
  const split = openBeside(single, "b");
  assert.equal(closePane(split, "nope").panes, split);
});

test("split ratios clamp to the bounds and reject unusable numbers", () => {
  assert.equal(clampSplitRatio(0.5), 0.5);
  assert.equal(clampSplitRatio(0), MIN_SPLIT_RATIO);
  assert.equal(clampSplitRatio(1), MAX_SPLIT_RATIO);
  assert.equal(clampSplitRatio(Number.NaN), DEFAULT_SPLIT_RATIO);
});

test("pane layout survives a serialize/parse round trip with its geometry", () => {
  const layout = {
    panes: openBeside([primary(["a", "b"], "a")], "b"),
    orientation: "horizontal" as const,
    ratio: 0.7,
  };
  assert.deepEqual(parsePaneLayout(serializePaneLayout(layout)), layout);
});

test("a version 2 layout migrates forward without losing tabs", () => {
  const panes = openBeside([primary(["a", "b"], "a", ["a"])], "b");
  const migrated = parsePaneLayout(
    JSON.stringify({ version: PANE_LAYOUT_VERSION - 1, panes }),
  );
  assert.deepEqual(migrated?.panes, panes);
  assert.equal(migrated?.orientation, DEFAULT_SPLIT_ORIENTATION);
  assert.equal(migrated?.ratio, DEFAULT_SPLIT_RATIO);
});

test("parse rejects malformed, versionless, and foreign payloads", () => {
  assert.equal(parsePaneLayout(null), null);
  assert.equal(parsePaneLayout("not json"), null);
  assert.equal(parsePaneLayout("{}"), null);
  assert.equal(parsePaneLayout(JSON.stringify({ version: 99, panes: [] })), null);
  assert.equal(parsePaneLayout(JSON.stringify({ version: 1, panes: [] })), null);
  assert.equal(
    parsePaneLayout(JSON.stringify({ version: PANE_LAYOUT_VERSION, panes: [{ paneId: 7 }] })),
    null,
  );
  assert.equal(
    parsePaneLayout(serializePaneLayout(layoutOf(defaultPanes(null))))?.panes.length,
    1,
  );
});

test("parse falls back to default geometry rather than discarding a usable layout", () => {
  const panes = defaultPanes("a");
  const parsed = parsePaneLayout(
    JSON.stringify({
      version: PANE_LAYOUT_VERSION,
      panes,
      orientation: "diagonal",
      ratio: "half",
    }),
  );
  assert.equal(parsed?.orientation, DEFAULT_SPLIT_ORIENTATION);
  assert.equal(parsed?.ratio, DEFAULT_SPLIT_RATIO);
});

test("parse clamps an out-of-bounds persisted ratio", () => {
  const parsed = parsePaneLayout(
    JSON.stringify({ version: PANE_LAYOUT_VERSION, panes: defaultPanes("a"), ratio: 0.99 }),
  );
  assert.equal(parsed?.ratio, MAX_SPLIT_RATIO);
});

test("togglePinTab pins and unpins an open tab, and ignores unknown tabs", () => {
  const panes = [primary(["a", "b"], "a")];
  const pinned = togglePinTab(panes, PRIMARY_PANE_ID, "b");
  assert.deepEqual(pinned[0]?.pinnedNoteIds, ["b"]);
  const unpinned = togglePinTab(pinned, PRIMARY_PANE_ID, "b");
  assert.deepEqual(unpinned[0]?.pinnedNoteIds, []);
  assert.equal(togglePinTab(panes, PRIMARY_PANE_ID, "missing"), panes);
});

test("reorderTab moves an unpinned tab before another tab or to the end", () => {
  const panes = [primary(["a", "b", "c"], "a")];
  assert.deepEqual(reorderTab(panes, PRIMARY_PANE_ID, "c", "b")[0]?.openNoteIds, ["a", "c", "b"]);
  assert.deepEqual(reorderTab(panes, PRIMARY_PANE_ID, "a", null)[0]?.openNoteIds, ["b", "c", "a"]);
});

test("reorderTab refuses to move pinned tabs or to displace them", () => {
  const panes = [primary(["a", "b", "c"], "a", ["a"])];
  assert.equal(reorderTab(panes, PRIMARY_PANE_ID, "a", "c"), panes);
  assert.equal(reorderTab(panes, PRIMARY_PANE_ID, "c", "a"), panes);
  assert.deepEqual(reorderTab(panes, PRIMARY_PANE_ID, "c", "b")[0]?.openNoteIds, ["a", "c", "b"]);
});

test("reorderTab is a no-op for unknown tabs and unchanged positions", () => {
  const panes = [primary(["a", "b"], "a")];
  assert.equal(reorderTab(panes, PRIMARY_PANE_ID, "missing", "a"), panes);
  assert.equal(reorderTab(panes, PRIMARY_PANE_ID, "a", "missing"), panes);
  assert.equal(reorderTab(panes, PRIMARY_PANE_ID, "a", "a"), panes);
  assert.equal(reorderTab(panes, PRIMARY_PANE_ID, "a", "b"), panes);
});

test("closeOtherTabs keeps the target and pinned tabs, promoting the target when active is removed", () => {
  const panes = [primary(["a", "b", "c"], "a", ["c"])];
  const result = closeOtherTabs(panes, PRIMARY_PANE_ID, "b");
  assert.deepEqual(result.panes[0]?.openNoteIds, ["b", "c"]);
  assert.equal(result.nextActiveNoteId, "b");
});

test("closeOtherTabs is a no-op when nothing would be removed", () => {
  const panes = [primary(["a"], "a")];
  const result = closeOtherTabs(panes, PRIMARY_PANE_ID, "a");
  assert.equal(result.panes, panes);
  assert.equal(result.nextActiveNoteId, undefined);
});

test("closeTabsToSide removes unpinned tabs on the given side but keeps the anchor and pinned tabs", () => {
  const panes = [primary(["a", "b", "c", "d"], "d", ["a"])];
  const right = closeTabsToSide(panes, PRIMARY_PANE_ID, "b", "right");
  assert.deepEqual(right.panes[0]?.openNoteIds, ["a", "b"]);
  assert.equal(right.nextActiveNoteId, "b");

  const left = closeTabsToSide(panes, PRIMARY_PANE_ID, "c", "left");
  assert.deepEqual(left.panes[0]?.openNoteIds, ["a", "c", "d"]);
  assert.equal(left.nextActiveNoteId, undefined);
});

test("closeAllTabs keeps only pinned tabs and promotes a survivor when the active tab closes", () => {
  const panes = [primary(["a", "b", "c"], "b", ["c"])];
  const result = closeAllTabs(panes, PRIMARY_PANE_ID);
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

test("recordClosedTab keeps the newest entries, dedupes by note, and caps the stack", () => {
  let stacks: ClosedTabStacks = new Map();
  for (let index = 0; index < CLOSED_TAB_LIMIT + 3; index += 1) {
    stacks = recordClosedTab(stacks, PRIMARY_PANE_ID, { noteId: `n${index}`, index });
  }
  const stack = stacks.get(PRIMARY_PANE_ID) ?? [];
  assert.equal(stack.length, CLOSED_TAB_LIMIT);
  assert.equal(stack[0]?.noteId, "n3");
  assert.equal(stack[stack.length - 1]?.noteId, `n${CLOSED_TAB_LIMIT + 2}`);

  const deduped = recordClosedTab(stacks, PRIMARY_PANE_ID, { noteId: "n5", index: 1 });
  const dedupedStack = deduped.get(PRIMARY_PANE_ID) ?? [];
  assert.equal(dedupedStack.filter((entry) => entry.noteId === "n5").length, 1);
  assert.equal(dedupedStack[dedupedStack.length - 1]?.noteId, "n5");
});

test("withClosedTabs drops the pane key once its stack empties", () => {
  const stacks = recordClosedTab(new Map(), PRIMARY_PANE_ID, { noteId: "a", index: 0 });
  assert.equal(withClosedTabs(stacks, PRIMARY_PANE_ID, []).has(PRIMARY_PANE_ID), false);
  assert.equal(discardClosedTabs(stacks, PRIMARY_PANE_ID).size, 0);
  assert.equal(discardClosedTabs(stacks, SECONDARY_PANE_ID), stacks);
});

test("reopenClosedTab restores the newest entry at its old position", () => {
  const panes = [primary(["a", "c"], "c")];
  const result = reopenClosedTab(
    panes,
    [
      { noteId: "d", index: 0 },
      { noteId: "b", index: 1 },
    ],
    PRIMARY_PANE_ID,
    () => true,
  );
  assert.deepEqual(result.panes[0]?.openNoteIds, ["a", "b", "c"]);
  assert.equal(result.panes[0]?.activeNoteId, "b");
  assert.equal(result.reopenedNoteId, "b");
  assert.deepEqual(result.closedTabs, [{ noteId: "d", index: 0 }]);
});

test("reopenClosedTab skips notes that went away and empties the stack when none survive", () => {
  const panes = [primary(["a"], "a")];
  const stack = [
    { noteId: "keep", index: 0 },
    { noteId: "gone", index: 1 },
  ];
  const skipped = reopenClosedTab(panes, stack, PRIMARY_PANE_ID, (id) => id !== "gone");
  assert.equal(skipped.reopenedNoteId, "keep");
  assert.deepEqual(skipped.closedTabs, []);

  const none = reopenClosedTab(panes, stack, PRIMARY_PANE_ID, () => false);
  assert.equal(none.reopenedNoteId, null);
  assert.deepEqual(none.closedTabs, []);
  assert.equal(none.panes, panes);
});

test("reopenClosedTab is a no-op for an empty stack, an unknown pane, or an open note", () => {
  const panes = [primary(["a"], "a")];
  const empty = reopenClosedTab(panes, [], PRIMARY_PANE_ID, () => true);
  assert.equal(empty.panes, panes);
  assert.equal(empty.reopenedNoteId, null);

  const unknown = reopenClosedTab(panes, [{ noteId: "b", index: 0 }], "nope", () => true);
  assert.equal(unknown.reopenedNoteId, null);
  assert.equal(unknown.closedTabs.length, 1);

  const alreadyOpen = reopenClosedTab(panes, [{ noteId: "a", index: 0 }], PRIMARY_PANE_ID, () => true);
  assert.equal(alreadyOpen.reopenedNoteId, null);
  assert.deepEqual(alreadyOpen.closedTabs, []);
});

test("moveTabInPane shifts the active tab one slot and wraps at the ends", () => {
  const panes = [primary(["a", "b", "c"], "b")];
  assert.deepEqual(moveTabInPane(panes, PRIMARY_PANE_ID, -1)[0]?.openNoteIds, ["b", "a", "c"]);
  assert.deepEqual(moveTabInPane(panes, PRIMARY_PANE_ID, 1)[0]?.openNoteIds, ["a", "c", "b"]);

  const first = [primary(["a", "b", "c"], "a")];
  assert.deepEqual(moveTabInPane(first, PRIMARY_PANE_ID, -1)[0]?.openNoteIds, ["b", "c", "a"]);
  const last = [primary(["a", "b", "c"], "c")];
  assert.deepEqual(moveTabInPane(last, PRIMARY_PANE_ID, 1)[0]?.openNoteIds, ["c", "a", "b"]);
});

test("moveTabInPane is a no-op for a single tab, no active tab, or an unknown pane", () => {
  const single = [primary(["a"], "a")];
  assert.equal(moveTabInPane(single, PRIMARY_PANE_ID, 1), single);
  const inactive = [primary(["a", "b"], null)];
  assert.equal(moveTabInPane(inactive, PRIMARY_PANE_ID, 1), inactive);
  const panes = [primary(["a", "b"], "a")];
  assert.equal(moveTabInPane(panes, "nope", 1), panes);
});

test("paneIndexInDirection never wraps and needs a split to move at all", () => {
  assert.equal(paneIndexInDirection(1, 0, 1), null);
  assert.equal(paneIndexInDirection(1, null, -1), null);
  assert.equal(paneIndexInDirection(2, 0, 1), 1);
  assert.equal(paneIndexInDirection(2, 1, -1), 0);
  assert.equal(paneIndexInDirection(2, 1, 1), null);
  assert.equal(paneIndexInDirection(2, 0, -1), null);
});

test("paneIndexInDirection lands on the nearest pane when focus is outside the panes", () => {
  assert.equal(paneIndexInDirection(2, null, -1), 0);
  assert.equal(paneIndexInDirection(2, null, 1), 1);
});

test("paneIndexCycling wraps at both ends and still needs a split", () => {
  assert.equal(paneIndexCycling(1, 0, 1), null);
  assert.equal(paneIndexCycling(1, null, -1), null);
  assert.equal(paneIndexCycling(2, 0, 1), 1);
  assert.equal(paneIndexCycling(2, 1, 1), 0);
  assert.equal(paneIndexCycling(2, 1, -1), 0);
  assert.equal(paneIndexCycling(2, 0, -1), 1);
});

test("paneIndexCycling enters from the far edge when focus is outside the panes", () => {
  assert.equal(paneIndexCycling(2, null, 1), 0);
  assert.equal(paneIndexCycling(2, null, -1), 1);
});
