import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceNode } from "../../src/contracts/workspace";
import { orderAvailableNodes } from "../../src/store/tree";

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
    pinnedAt: null,
    ...partial,
  };
}

test("siblings place folders above notes regardless of rank", () => {
  const ordered = orderAvailableNodes([
    node({ id: "note-a", kind: "note", rank: 100 }),
    node({ id: "folder-b", kind: "folder", rank: 400 }),
    node({ id: "note-b", kind: "note", rank: 200 }),
    node({ id: "folder-a", kind: "folder", rank: 300 }),
  ]);
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["folder-a", "folder-b", "note-a", "note-b"],
  );
});

test("dot-prefixed titles sink below visible entries, folders first", () => {
  const ordered = orderAvailableNodes([
    node({ id: "dot-note", kind: "note", rank: 10, title: ".hidden-note" }),
    node({ id: "dot-folder", kind: "folder", rank: 20, title: ".git" }),
    node({ id: "note", kind: "note", rank: 500, title: "Note" }),
    node({ id: "folder", kind: "folder", rank: 600, title: "Docs" }),
  ]);
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["folder", "note", "dot-folder", "dot-note"],
  );
});

test("grouping applies at every depth and keeps parents first", () => {
  const ordered = orderAvailableNodes([
    node({ id: "root-note", kind: "note", rank: 100 }),
    node({ id: "root-folder", kind: "folder", rank: 200 }),
    node({ id: "child-note", kind: "note", parentId: "root-folder", rank: 100 }),
    node({ id: "child-folder", kind: "folder", parentId: "root-folder", rank: 200 }),
    node({
      id: "child-dot-folder",
      kind: "folder",
      parentId: "root-folder",
      rank: 50,
      title: ".archive",
    }),
  ]);
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["root-folder", "child-folder", "child-note", "child-dot-folder", "root-note"],
  );
});
