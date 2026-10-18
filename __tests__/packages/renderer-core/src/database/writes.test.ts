import assert from "node:assert/strict";
import { test } from "vitest";
import {
  discoverColumns,
  type PropertyColumn,
} from "../../../../../packages/renderer-core/src/database/columns";
import { defaultDatabaseView } from "../../../../../packages/renderer-core/src/database/config";
import { createDatabaseRowsSelector } from "../../../../../packages/renderer-core/src/database/rows";
import {
  impliedPresets,
  planCellWrite,
  planDatabaseNote,
  type DatabaseWrite,
} from "../../../../../packages/renderer-core/src/database/writes";
import { createRendererStore } from "../../../../../packages/renderer-core/src/store/store";
import type { RendererStore } from "../../../../../packages/renderer-core/src/store/types";
import { databaseState } from "./fixtures";

let sequence = 0;
function createId(kind: "property" | "option"): string {
  sequence += 1;
  return `${kind}_${sequence}`;
}

function setup() {
  const store = createRendererStore(databaseState());
  const rows = createDatabaseRowsSelector("projects", true)(store.getState());
  const columns = discoverColumns(rows, true);
  function column(key: string): PropertyColumn {
    return columns.find((entry) => entry.key === key) as PropertyColumn;
  }
  return { store, columns, column };
}

function apply(store: RendererStore, write: DatabaseWrite): void {
  assert.equal(write.status, "ready", write.status === "refused" ? write.message : "");
  if (write.status === "ready") store.applyOperations(write.operations);
}

test("setting a select by label reuses the note's own option and keeps id and position", () => {
  const { store, column } = setup();
  const write = planCellWrite(
    store.getState(),
    "beta",
    column("p:status"),
    { kind: "labels", labels: ["doing"] },
    10,
    createId,
  );
  apply(store, write);
  const status = store.getState().propertiesByNoteId.get("beta")![0]!;
  assert.equal(status.id, "beta_0");
  assert.equal(status.position, 0);
  assert.deepEqual(status.value, { valueVersion: 1, type: "select", value: "b_doing" });
});

test("a label the note lacks becomes a new option with the column's color", () => {
  const { store, column } = setup();
  const write = planCellWrite(
    store.getState(),
    "beta",
    column("p:status"),
    { kind: "labels", labels: ["Review"] },
    10,
    createId,
  );
  apply(store, write);
  const status = store.getState().propertiesByNoteId.get("beta")![0]!;
  const option = status.options.at(-1)!;
  assert.equal(option.label, "Review");
  assert.equal(status.value.value, option.id);
  assert.notEqual(option.color, "gray");
});

test("a note without the property gets it appended, seeded with the column's options", () => {
  const { store, column } = setup();
  const write = planCellWrite(
    store.getState(),
    "delta",
    column("p:priority"),
    { kind: "value", value: { valueVersion: 1, type: "number", value: 3 } },
    10,
    createId,
  );
  apply(store, write);
  const properties = store.getState().propertiesByNoteId.get("delta")!;
  assert.equal(properties.length, 2);
  assert.equal(properties[1]?.name, "Priority");
  assert.equal(properties[1]?.position, 1);
  assert.deepEqual(properties[1]?.value, { valueVersion: 1, type: "number", value: 3 });
});

test("writes refuse mismatched types, trashed notes and invalid values", () => {
  const { store, column } = setup();
  const state = store.getState();
  const mismatched = planCellWrite(
    state,
    "gamma",
    column("p:status"),
    { kind: "labels", labels: ["Done"] },
    10,
    createId,
  );
  assert.equal(mismatched.status, "refused");
  const trashed = planCellWrite(
    state,
    "trashed",
    column("p:priority"),
    { kind: "value", value: { valueVersion: 1, type: "number", value: 1 } },
    10,
    createId,
  );
  assert.equal(trashed.status, "refused");
  const invalid = planCellWrite(
    state,
    "alpha",
    column("p:priority"),
    { kind: "value", value: { valueVersion: 1, type: "number", value: Number.NaN } },
    10,
    createId,
  );
  assert.equal(invalid.status, "refused");
});

test("an unchanged value produces no operations", () => {
  const { store, column } = setup();
  const write = planCellWrite(
    store.getState(),
    "alpha",
    column("p:priority"),
    { kind: "value", value: { valueVersion: 1, type: "number", value: 2 } },
    10,
    createId,
  );
  assert.deepEqual(write, { status: "ready", operations: [] });
});

test("a new note lands in the folder with its group and filter values, keeping the active note", () => {
  const { store, columns } = setup();
  const view = {
    ...defaultDatabaseView("projects"),
    layout: "board" as const,
    groupBy: "p:status",
    filters: [{ column: "p:shipped", operator: "checked" as const, value: "" }],
  };
  const presets = impliedPresets(columns, view, "done");
  const write = planDatabaseNote(
    store.getState(),
    "projects",
    "Launch",
    { documentJson: { type: "doc", content: [] }, markdown: "# Launch\n\n" },
    presets,
    10,
    "launch",
    createId,
  );
  apply(store, write);
  const state = store.getState();
  assert.equal(state.nodes.get("launch")?.parentId, "projects");
  assert.equal(state.activeNoteId, "epsilon");
  const properties = state.propertiesByNoteId.get("launch")!;
  assert.deepEqual(
    properties.map((property) => [property.name, property.position]),
    [
      ["Shipped", 0],
      ["Status", 1],
    ],
  );
  const status = properties[1]!;
  assert.equal(status.options.find((option) => option.id === status.value.value)?.label, "Done");
});
