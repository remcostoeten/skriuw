import assert from "node:assert/strict";
import { test } from "vitest";
import {
  arrangeDatabase,
  cellValue,
  defaultGroupColumn,
  filterOperators,
} from "../../../../../packages/renderer-core/src/database/arrange";
import {
  discoverColumns,
  type DatabaseColumn,
} from "../../../../../packages/renderer-core/src/database/columns";
import {
  defaultDatabaseView,
  type DatabaseView,
} from "../../../../../packages/renderer-core/src/database/config";
import { createDatabaseRowsSelector } from "../../../../../packages/renderer-core/src/database/rows";
import { databaseState } from "./fixtures";

const state = databaseState();
const rows = createDatabaseRowsSelector("projects", true)(state);
const columns = discoverColumns(rows, true);

function column(key: string): DatabaseColumn {
  return columns.find((entry) => entry.key === key)!;
}

function arrange(overrides: Partial<DatabaseView>, search = "") {
  const view = { ...defaultDatabaseView("projects"), ...overrides };
  return arrangeDatabase(rows, columns, view, search, state.people);
}

function ids(list: readonly { noteId: string }[]): string[] {
  return list.map((row) => row.noteId);
}

test("a mismatched type reads as empty for that column", () => {
  const gamma = rows.find((row) => row.noteId === "gamma")!;
  assert.deepEqual(cellValue(gamma, column("p:status")), { kind: "options", keys: [] });
});

test("select filters match by folded label across per-note option ids", () => {
  const result = arrange({ filters: [{ column: "p:status", operator: "is", value: "DONE" }] });
  assert.deepEqual(ids(result.rows), ["beta"]);
  const excluded = arrange({
    filters: [{ column: "p:status", operator: "is-not", value: "done" }],
  });
  assert.deepEqual(ids(excluded.rows), ["delta", "alpha", "gamma"]);
});

test("number, empty and checkbox filters combine with AND", () => {
  assert.deepEqual(
    ids(arrange({ filters: [{ column: "p:priority", operator: "greater", value: "1" }] }).rows),
    ["alpha"],
  );
  assert.deepEqual(
    ids(arrange({ filters: [{ column: "p:priority", operator: "empty", value: "" }] }).rows),
    ["delta", "gamma"],
  );
  assert.deepEqual(
    ids(
      arrange({
        filters: [
          { column: "p:shipped", operator: "unchecked", value: "" },
          { column: "p:priority", operator: "not-empty", value: "" },
        ],
      }).rows,
    ),
    ["alpha", "beta"],
  );
});

test("filters on columns this scope lacks are reported, not applied", () => {
  const result = arrange({ filters: [{ column: "p:gone", operator: "contains", value: "x" }] });
  assert.equal(result.rows.length, 4);
  assert.equal(result.inactiveFilters.length, 1);
});

test("sorting keeps empty values last in both directions and ties in tree order", () => {
  assert.deepEqual(ids(arrange({ sorts: [{ column: "p:priority", direction: "asc" }] }).rows), [
    "beta",
    "alpha",
    "delta",
    "gamma",
  ]);
  assert.deepEqual(ids(arrange({ sorts: [{ column: "p:priority", direction: "desc" }] }).rows), [
    "alpha",
    "beta",
    "delta",
    "gamma",
  ]);
});

test("select sorts follow option order", () => {
  assert.deepEqual(ids(arrange({ sorts: [{ column: "p:status", direction: "asc" }] }).rows), [
    "delta",
    "alpha",
    "beta",
    "gamma",
  ]);
});

test("the quick search matches titles", () => {
  assert.deepEqual(ids(arrange({}, "  ALP ").rows), ["alpha"]);
});

test("a board groups by select option, keeping empty groups and a no-value group first", () => {
  const result = arrange({ layout: "board", groupBy: "p:status" });
  assert.deepEqual(
    result.groups?.map((group) => [group.key, ids(group.rows)]),
    [
      [null, ["gamma"]],
      ["todo", ["delta"]],
      ["doing", ["alpha"]],
      ["done", ["beta"]],
    ],
  );
  assert.equal(arrange({ layout: "table", groupBy: "p:status" }).groups, null);
});

test("checkbox columns group as unchecked then checked", () => {
  const result = arrange({ layout: "board", groupBy: "p:shipped" });
  assert.deepEqual(
    result.groups?.map((group) => [group.key, group.rows.length]),
    [
      ["unchecked", 4],
      ["checked", 0],
    ],
  );
});

test("boards default to a status-like select column and operators follow the type", () => {
  assert.equal(defaultGroupColumn(columns)?.key, "p:status");
  assert.deepEqual(filterOperators(column("p:shipped")), ["checked", "unchecked"]);
  assert.ok(filterOperators(column("updated")).includes("before"));
});
