import assert from "node:assert/strict";
import test from "node:test";
import {
  RAIL_ITEMS,
  railModShiftKeys,
  railSequenceKeys,
} from "../../src/commands/rail-items";

test("rail items are ordered Notes, Journal, Tags, People, Trash", () => {
  assert.deepEqual(
    RAIL_ITEMS.map((item) => item.actionId),
    ["goToNotes", "goToJournal", "goToTags", "goToPeople", "goToTrash"],
  );
  assert.deepEqual(
    RAIL_ITEMS.map((item) => item.route),
    ["notes", "journal", "tags", "people", "trash"],
  );
});

test("railSequenceKeys and railModShiftKeys key off the rail position", () => {
  assert.equal(railSequenceKeys(3), "g then t then 3");
  assert.equal(railModShiftKeys(3), "mod+shift+3");
});
