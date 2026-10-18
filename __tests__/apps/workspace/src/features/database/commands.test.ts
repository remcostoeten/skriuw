import assert from "node:assert/strict";
import { test } from "vitest";
import { databaseTargetFolder } from "@/features/database/commands";
import { databaseState } from "../../../../../packages/renderer-core/src/database/fixtures";

test("the folder command follows the sidebar's focused folder first", () => {
  const state = { ...databaseState(), focusedNodeId: "archive", activeNoteId: "alpha" };
  assert.equal(databaseTargetFolder(state), "archive");
});

test("without a focused folder it uses the open note's folder", () => {
  const state = { ...databaseState(), focusedNodeId: null, activeNoteId: "alpha" };
  assert.equal(databaseTargetFolder(state), "projects");
});

test("root notes and journal entries have no folder to open", () => {
  assert.equal(databaseTargetFolder({ ...databaseState(), activeNoteId: "epsilon" }), null);
  assert.equal(databaseTargetFolder({ ...databaseState(), activeNoteId: "day" }), null);
});
