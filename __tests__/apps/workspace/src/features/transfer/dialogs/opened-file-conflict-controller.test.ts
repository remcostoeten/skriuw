import assert from "node:assert/strict";
import { test } from "vitest";
import {
  registerOpenedFileConflictListener,
  requestOpenedFileConflictChoice,
  type OpenedFileConflictRequest,
} from "@/features/transfer/dialogs/opened-file-conflict-controller";

test("waits for a host and shows conflicts one at a time", async () => {
  const first = requestOpenedFileConflictChoice("Todo", "/home/me/todo.md");
  const second = requestOpenedFileConflictChoice("Plan", "/home/me/plan.md");
  const shown: OpenedFileConflictRequest[] = [];
  const unregister = registerOpenedFileConflictListener((request) => shown.push(request));

  assert.deepEqual(
    shown.map((request) => request.noteTitle),
    ["Todo"],
  );
  shown[0]?.resolve("file");
  assert.equal(await first, "file");
  assert.deepEqual(
    shown.map((request) => request.noteTitle),
    ["Todo", "Plan"],
  );
  shown[1]?.resolve(null);
  assert.equal(await second, null);
  unregister();
});
