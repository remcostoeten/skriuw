import assert from "node:assert/strict";
import { test } from "vitest";
import {
  discoverColumns,
  orderedColumns,
  rowProperty,
  sameColumnSchema,
  visibleColumns,
} from "../../../../../packages/renderer-core/src/database/columns";
import { createDatabaseRowsSelector } from "../../../../../packages/renderer-core/src/database/rows";
import { createRendererStore } from "../../../../../packages/renderer-core/src/store/store";
import { databaseState, numberProperty, selectProperty } from "./fixtures";

function columnsFor(subfolders: boolean) {
  const rows = createDatabaseRowsSelector("projects", subfolders)(databaseState());
  return { rows, columns: discoverColumns(rows, subfolders) };
}

test("property names merge across case and spacing, between the built-ins", () => {
  const { columns } = columnsFor(true);
  assert.deepEqual(
    columns.map((column) => column.key),
    ["title", "folder", "p:status", "p:priority", "p:shipped", "created", "updated", "words"],
  );
  assert.equal(columns.find((column) => column.key === "p:status")?.name, "Status");
});

test("a column takes the type most notes store and merges options by label", () => {
  const { columns } = columnsFor(true);
  const status = columns.find((column) => column.key === "p:status");
  assert.equal(status?.type, "select");
  assert.deepEqual(
    status?.options.map((option) => [option.key, option.label, option.color]),
    [
      ["todo", "Todo", "gray"],
      ["doing", "Doing", "blue"],
      ["done", "Done", "green"],
    ],
  );
});

test("the folder column only exists when subfolders are included", () => {
  const { columns } = columnsFor(false);
  assert.equal(
    columns.some((column) => column.key === "folder"),
    false,
  );
});

test("rows resolve their property by folded name", () => {
  const { rows } = columnsFor(false);
  const beta = rows.find((row) => row.noteId === "beta")!;
  assert.equal(rowProperty(beta, "p:status")?.name, " status ");
  assert.equal(rowProperty(beta, "p:missing"), null);
});

test("saved order wins, new columns append, and Name always leads and stays visible", () => {
  const { columns } = columnsFor(false);
  const ordered = orderedColumns(columns, ["p:priority", "updated", "title", "p:gone"]);
  assert.deepEqual(
    ordered.slice(0, 3).map((column) => column.key),
    ["title", "p:priority", "updated"],
  );
  const visible = visibleColumns(columns, [], ["title", "created", "words", "p:shipped"]);
  assert.deepEqual(
    visible.map((column) => column.key),
    ["title", "p:status", "p:priority", "updated"],
  );
});

test("a value edit keeps the column schema and a new option or property changes it", () => {
  const store = createRendererStore(databaseState());
  const select = createDatabaseRowsSelector("projects", false);
  const before = select(store.getState());
  store.applyOperations([
    { type: "set_note_property", property: numberProperty("alpha", "Priority", 9, 1), at: 50 },
  ]);
  const edited = select(store.getState());
  assert.equal(sameColumnSchema(before, edited), true);

  const alphaStatus = store.getState().propertiesByNoteId.get("alpha")![0]!;
  store.applyOperations([
    {
      type: "set_note_property",
      property: selectProperty(
        "alpha",
        "Status",
        [...alphaStatus.options, { id: "a_new", label: "Blocked", color: "red" }],
        "a_new",
        0,
      ),
      at: 60,
    },
  ]);
  assert.equal(sameColumnSchema(edited, select(store.getState())), false);
  assert.equal(sameColumnSchema(before, before.slice(1)), false);
});
