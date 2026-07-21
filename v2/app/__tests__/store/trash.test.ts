import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode } from "../../src/contracts/workspace";
import {
  isNodeInSubtree,
  trashWindowRange,
  trashedRoots,
  trashedSubtreeNodes,
} from "../../src/store/trash";

function node(
  partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind">,
): WorkspaceNode {
  return {
    parentId: null,
    rank: 0,
    title: partial.id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...partial,
  };
}

function nodes(): ReadonlyMap<string, WorkspaceNode> {
  const values = [
    node({ id: "active", kind: "note" }),
    node({ id: "older-note", kind: "note", deletedAt: 10, title: "Older" }),
    node({ id: "folder", kind: "folder", deletedAt: 20, title: "Project" }),
    node({ id: "nested-folder", kind: "folder", parentId: "folder", rank: 100 }),
    node({ id: "nested-note", kind: "note", parentId: "nested-folder", rank: 200 }),
    node({ id: "nested-trash", kind: "note", parentId: "folder", deletedAt: 15, rank: 300 }),
  ];
  return new Map(values.map((value) => [value.id, value]));
}

test("trash roots exclude inherited markers and include subtree totals", () => {
  assert.deepEqual(trashedRoots(nodes()), [
    {
      id: "folder",
      kind: "folder",
      title: "Project",
      deletedAt: 20,
      descendantCount: 3,
      noteCount: 2,
      folderCount: 2,
    },
    {
      id: "older-note",
      kind: "note",
      title: "Older",
      deletedAt: 10,
      descendantCount: 0,
      noteCount: 1,
      folderCount: 0,
    },
  ]);
});

test("trash subtree projection is parents-first and cycle-safe", () => {
  assert.deepEqual(
    trashedSubtreeNodes(nodes(), "folder").map((entry) => entry.id),
    ["folder", "nested-folder", "nested-note", "nested-trash"],
  );
  assert.equal(isNodeInSubtree(nodes(), "nested-note", "folder"), true);
  assert.equal(isNodeInSubtree(nodes(), "active", "folder"), false);
});

test("trash list rendering stays bounded for a 5,000-item workspace", () => {
  const large = new Map<string, WorkspaceNode>();
  for (let index = 0; index < 5_000; index += 1) {
    const value = node({
      id: `deleted-${index}`,
      kind: "note",
      rank: index * 1024,
      deletedAt: index + 1,
    });
    large.set(value.id, value);
  }
  assert.equal(trashedRoots(large).length, 5_000);
  const window = trashWindowRange(5_000, 120_000, 720, 60, 5);
  assert.ok(window.end - window.start <= 22);
});
