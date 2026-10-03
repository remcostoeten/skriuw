import assert from "node:assert/strict";
import { test } from "vitest";
import { mergeWorkspaceChanges } from "@/features/sync/workspace-change";

test("merged changes union note ids and widen to the broadest scope", () => {
  const merged = mergeWorkspaceChanges(
    { noteIds: ["a", "b"], structureChanged: false, full: false },
    { noteIds: ["b", "c"], structureChanged: true, full: false },
  );
  assert.deepEqual(merged, { noteIds: ["a", "b", "c"], structureChanged: true, full: false });
  assert.deepEqual(
    mergeWorkspaceChanges(null, { noteIds: [], structureChanged: false, full: true }),
    { noteIds: [], structureChanged: false, full: true },
  );
});
