import assert from "node:assert/strict";
import { test } from "vitest";
import { RAIL_ITEMS } from "@/commands/rail-items";

test("rail items are ordered Notes, Journal, Tasks, Tags, People, Trash", () => {
  assert.deepEqual(
    RAIL_ITEMS.map((item) => item.actionId),
    ["goToNotes", "goToJournal", "goToTasks", "goToTags", "goToPeople", "goToTrash"],
  );
  assert.deepEqual(
    RAIL_ITEMS.map((item) => item.route),
    ["notes", "journal", "tasks", "tags", "people", "trash"],
  );
});
