import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createDatabaseRowsSelector,
  databaseScopeStatus,
} from "../../../../../packages/renderer-core/src/database/rows";
import { createRendererStore } from "../../../../../packages/renderer-core/src/store/store";
import { databaseState } from "./fixtures";

test("a folder scope lists its direct notes in tree order, without trash", () => {
  const rows = createDatabaseRowsSelector("projects", false)(databaseState());
  assert.deepEqual(
    rows.map((row) => row.noteId),
    ["alpha", "beta", "gamma"],
  );
});

test("subfolders add nested notes with their folder path, folders first as in the tree", () => {
  const rows = createDatabaseRowsSelector("projects", true)(databaseState());
  assert.deepEqual(
    rows.map((row) => [row.noteId, row.folderPath]),
    [
      ["delta", "Archive"],
      ["alpha", ""],
      ["beta", ""],
      ["gamma", ""],
    ],
  );
});

test("the workspace scope skips the journal", () => {
  const rows = createDatabaseRowsSelector(null, true)(databaseState());
  assert.deepEqual(
    rows.map((row) => row.noteId),
    ["delta", "alpha", "beta", "gamma", "epsilon"],
  );
});

test("locked notes stay listed and report the lock", () => {
  const rows = createDatabaseRowsSelector("projects", false)(databaseState());
  const gamma = rows.find((row) => row.noteId === "gamma");
  assert.equal(gamma?.locked, true);
});

test("scope status explains folders that cannot open", () => {
  const state = databaseState();
  assert.equal(databaseScopeStatus(state, null), "ready");
  assert.equal(databaseScopeStatus(state, "projects"), "ready");
  assert.equal(databaseScopeStatus(state, "alpha"), "not-folder");
  assert.equal(databaseScopeStatus(state, "journal-root"), "journal");
  assert.equal(databaseScopeStatus(state, "nope"), "missing");
});

test("unrelated updates keep the rows array and an edit replaces one row", () => {
  const store = createRendererStore(databaseState());
  const select = createDatabaseRowsSelector("projects", true);
  const before = select(store.getState());

  store.setActiveNote("alpha");
  store.setFocusedNode("beta");
  assert.equal(select(store.getState()), before);

  const property = store.getState().propertiesByNoteId.get("beta")![1]!;
  store.applyOperations([
    {
      type: "set_note_property",
      property: { ...property, value: { valueVersion: 1, type: "number", value: 5 } },
      at: 10,
    },
  ]);
  const after = select(store.getState());
  assert.notEqual(after, before);
  assert.deepEqual(
    after.map((row, index) => row === before[index]),
    [true, true, false, true],
  );
});
