import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceNode } from "@skriuw/renderer-core/contracts/workspace";
import { createInitialState } from "@skriuw/renderer-core/store/store";
import { demoSnapshot } from "@/shell/demo-workspace";
import { selectTrashEntries, trashEntriesEqual } from "@/features/trash/trash-model";

function deletedNode(
  id: string,
  kind: WorkspaceNode["kind"],
  parentId: string | null,
  title: string,
  deletedAt: number,
): WorkspaceNode {
  return {
    id,
    kind,
    parentId,
    rank: 1,
    title,
    icon: null,
    createdAt: 1,
    updatedAt: deletedAt,
    deletedAt,
    pinnedAt: null,
  };
}

function stateWithTrash() {
  const snapshot = demoSnapshot();
  snapshot.nodes = [
    ...snapshot.nodes,
    deletedNode("folder-archive", "folder", null, "Archive", 30),
    deletedNode("note-archived", "note", "folder-archive", "Archived note", 20),
    deletedNode("note-deleted", "note", null, "Deleted note", 40),
  ];
  return createInitialState(snapshot, undefined, {
    tags: snapshot.tags,
    people: snapshot.people,
    references: snapshot.references,
  });
}

test("trash lists deleted roots once and counts their descendants", () => {
  const entries = selectTrashEntries(stateWithTrash());

  assert.deepEqual(
    entries.map((entry) => [entry.title, entry.descendantCount]),
    [
      ["Deleted note", 0],
      ["Archive", 1],
    ],
  );
});

test("trash entry equality compares values rather than array identity", () => {
  const first = selectTrashEntries(stateWithTrash());
  const second = selectTrashEntries(stateWithTrash());

  assert.equal(trashEntriesEqual(first, second), true);
});
