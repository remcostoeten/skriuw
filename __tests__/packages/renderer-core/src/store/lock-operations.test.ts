import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceNode } from "../../../../../packages/renderer-core/src/contracts/workspace";
import { reduceOperation } from "../../../../../packages/renderer-core/src/store/operations";

function node(id: string, kind: "note" | "folder", parentId: string | null): WorkspaceNode {
  return {
    id,
    kind,
    parentId,
    rank: 1,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
    lockedAt: null,
  };
}

test("locking a folder flags the folder and everything under it", () => {
  const nodes = new Map<string, WorkspaceNode>([
    ["folder", node("folder", "folder", null)],
    ["child", node("child", "note", "folder")],
    ["grandchild", node("grandchild", "note", "child")],
    ["outside", node("outside", "note", null)],
  ]);
  const locked = reduceOperation(nodes, {
    type: "set_node_locked",
    id: "folder",
    locked: true,
    at: 50,
  });
  assert.equal(locked.get("folder")?.lockedAt, 50);
  assert.equal(locked.get("child")?.lockedAt, 50);
  assert.equal(locked.get("grandchild")?.lockedAt, 50);
  assert.equal(locked.get("outside")?.lockedAt, null);
  assert.equal(locked.get("child")?.updatedAt, 50);

  const unlocked = reduceOperation(locked, {
    type: "set_node_locked",
    id: "folder",
    locked: false,
    at: 60,
  });
  for (const id of ["folder", "child", "grandchild"]) {
    assert.equal(unlocked.get(id)?.lockedAt, null, id);
  }
});

test("locking an already locked note or a missing node leaves the map untouched", () => {
  const nodes = new Map<string, WorkspaceNode>([
    ["note", { ...node("note", "note", null), lockedAt: 10 }],
  ]);
  assert.equal(
    reduceOperation(nodes, { type: "set_node_locked", id: "note", locked: true, at: 20 }),
    nodes,
  );
  assert.equal(
    reduceOperation(nodes, { type: "set_node_locked", id: "ghost", locked: true, at: 20 }),
    nodes,
  );
});
