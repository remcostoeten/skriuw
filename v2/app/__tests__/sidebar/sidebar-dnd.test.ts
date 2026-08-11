import assert from "node:assert/strict";
import test from "node:test";
import {
  autoScrollStep,
  dragRoots,
  dropMoves,
  dropPlacement,
  dropZoneForOffset,
  indicatorIndentDepth,
  isValidDrop,
  isWithinSubtree,
  moveCargoVanished,
  moveDropTarget,
  rowIndexAt,
  sameDropTarget,
} from "../../src/sidebar/sidebar-dnd";
import { buildNodeIndex } from "../../src/store/tree";

const { nodes } = buildNodeIndex([
  { id: "folder-a", parentId: null, kind: "folder", title: "A" },
  { id: "note-a1", parentId: "folder-a", kind: "note", title: "a1" },
  { id: "folder-b", parentId: "folder-a", kind: "folder", title: "B" },
  { id: "note-b1", parentId: "folder-b", kind: "note", title: "b1" },
  { id: "note-root", parentId: null, kind: "note", title: "root note" },
]);

test("drop zones split folders 25/50/25 and notes 50/50", () => {
  assert.equal(dropZoneForOffset(4, 35, true), "before");
  assert.equal(dropZoneForOffset(17, 35, true), "inside");
  assert.equal(dropZoneForOffset(31, 35, true), "after");
  assert.equal(dropZoneForOffset(17, 35, false), "before");
  assert.equal(dropZoneForOffset(18, 35, false), "after");
  assert.equal(dropZoneForOffset(-3, 35, true), "before");
  assert.equal(dropZoneForOffset(80, 35, true), "after");
});

test("row hit-testing maps content y to index, root gap, or nothing", () => {
  assert.equal(rowIndexAt(0, 35, 5), 0);
  assert.equal(rowIndexAt(34, 35, 5), 0);
  assert.equal(rowIndexAt(35, 35, 5), 1);
  assert.equal(rowIndexAt(174, 35, 5), 4);
  assert.equal(rowIndexAt(175, 35, 5), "root-gap");
  assert.equal(rowIndexAt(-1, 35, 5), null);
  assert.equal(rowIndexAt(10, 0, 5), null);
});

test("drag roots drop nodes whose ancestor is also dragged", () => {
  assert.deepEqual(dragRoots(["folder-a", "note-b1", "note-root"], nodes), [
    "folder-a",
    "note-root",
  ]);
  assert.deepEqual(dragRoots(["note-a1", "note-b1"], nodes), ["note-a1", "note-b1"]);
});

test("dropping into the dragged subtree or onto itself is rejected", () => {
  assert.equal(isWithinSubtree(nodes, "note-b1", "folder-a"), true);
  assert.equal(isWithinSubtree(nodes, "note-root", "folder-a"), false);
  assert.equal(
    isValidDrop(nodes, ["folder-a"], { kind: "row", id: "note-b1", zone: "before" }),
    false,
  );
  assert.equal(
    isValidDrop(nodes, ["folder-a"], { kind: "row", id: "folder-a", zone: "after" }),
    false,
  );
  assert.equal(
    isValidDrop(nodes, ["folder-a"], { kind: "row", id: "note-root", zone: "after" }),
    true,
  );
  assert.equal(isValidDrop(nodes, ["folder-a"], { kind: "root-gap" }), true);
  assert.equal(isValidDrop(nodes, [], { kind: "root-gap" }), false);
});

test("placements map zones to move positions", () => {
  assert.deepEqual(dropPlacement(nodes, { kind: "row", id: "folder-b", zone: "inside" }), {
    parentId: "folder-b",
    position: { type: "last" },
  });
  assert.deepEqual(dropPlacement(nodes, { kind: "row", id: "note-a1", zone: "before" }), {
    parentId: "folder-a",
    position: { type: "before", anchorId: "note-a1" },
  });
  assert.deepEqual(dropPlacement(nodes, { kind: "root-gap" }), {
    parentId: null,
    position: { type: "last" },
  });
  assert.equal(dropPlacement(nodes, { kind: "row", id: "missing", zone: "after" }), null);
});

test("multi-drag after-drops emit moves in reverse order to keep row order", () => {
  const after = dropMoves(nodes, ["note-a1", "note-root"], {
    kind: "row",
    id: "note-b1",
    zone: "after",
  });
  assert.deepEqual(
    after.map((move) => move.id),
    ["note-root", "note-a1"],
  );
  const before = dropMoves(nodes, ["note-a1", "note-root"], {
    kind: "row",
    id: "note-b1",
    zone: "before",
  });
  assert.deepEqual(
    before.map((move) => move.id),
    ["note-a1", "note-root"],
  );
  assert.deepEqual(
    dropMoves(nodes, ["folder-a"], { kind: "row", id: "note-b1", zone: "before" }),
    [],
  );
});

test("indicator indents to the target row depth and root gap to depth one", () => {
  assert.equal(indicatorIndentDepth(nodes, { kind: "row", id: "note-b1", zone: "before" }), 3);
  assert.equal(indicatorIndentDepth(nodes, { kind: "row", id: "folder-a", zone: "after" }), 1);
  assert.equal(indicatorIndentDepth(nodes, { kind: "root-gap" }), 1);
});

test("drop target identity compares id and zone", () => {
  assert.equal(
    sameDropTarget(
      { kind: "row", id: "note-a1", zone: "before" },
      { kind: "row", id: "note-a1", zone: "before" },
    ),
    true,
  );
  assert.equal(
    sameDropTarget(
      { kind: "row", id: "note-a1", zone: "before" },
      { kind: "row", id: "note-a1", zone: "after" },
    ),
    false,
  );
  assert.equal(sameDropTarget({ kind: "root-gap" }, { kind: "root-gap" }), true);
  assert.equal(sameDropTarget({ kind: "root-gap" }, null), false);
  assert.equal(sameDropTarget(null, null), true);
});

test("auto-scroll steps ramp toward the edges and idle in the middle", () => {
  assert.equal(autoScrollStep(500, 100, 800, 36, 14), 0);
  assert.equal(autoScrollStep(100, 100, 800, 36, 14), -14);
  assert.equal(autoScrollStep(800, 100, 800, 36, 14), 14);
  const nearTop = autoScrollStep(130, 100, 800, 36, 14);
  assert.equal(nearTop < 0 && nearTop > -14, true);
  const nearBottom = autoScrollStep(770, 100, 800, 36, 14);
  assert.equal(nearBottom > 0 && nearBottom < 14, true);
});

test("move-mode target resolves folders directly and notes to their parent", () => {
  assert.deepEqual(moveDropTarget(nodes, "folder-b"), {
    kind: "row",
    id: "folder-b",
    zone: "inside",
  });
  assert.deepEqual(moveDropTarget(nodes, "note-b1"), {
    kind: "row",
    id: "folder-b",
    zone: "inside",
  });
  assert.deepEqual(moveDropTarget(nodes, "note-root"), { kind: "root-gap" });
  assert.deepEqual(moveDropTarget(nodes, null), { kind: "root-gap" });
  assert.deepEqual(moveDropTarget(nodes, "missing"), { kind: "root-gap" });
});

test("move-mode drop lands cargo inside the focused folder", () => {
  assert.deepEqual(dropMoves(nodes, ["note-root"], moveDropTarget(nodes, "folder-b")), [
    {
      id: "note-root",
      placement: { parentId: "folder-b", position: { type: "last" } },
    },
  ]);
});

test("move-mode drop on a note lands cargo in that note's parent", () => {
  assert.deepEqual(dropMoves(nodes, ["note-root"], moveDropTarget(nodes, "note-a1")), [
    {
      id: "note-root",
      placement: { parentId: "folder-a", position: { type: "last" } },
    },
  ]);
});

test("move-mode refuses to drop a folder into its own subtree", () => {
  assert.deepEqual(dropMoves(nodes, ["folder-a"], moveDropTarget(nodes, "folder-b")), []);
  assert.deepEqual(dropMoves(nodes, ["folder-a"], moveDropTarget(nodes, "note-b1")), []);
  assert.deepEqual(dropMoves(nodes, ["folder-a"], moveDropTarget(nodes, "folder-a")), []);
});

test("move-mode cargo vanish detection fires once any cargo node leaves the tree", () => {
  assert.equal(moveCargoVanished(nodes, ["note-a1", "note-root"]), false);
  assert.equal(moveCargoVanished(nodes, ["note-a1", "ghost"]), true);
  assert.equal(moveCargoVanished(nodes, []), false);
});
