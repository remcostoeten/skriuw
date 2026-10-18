import assert from "node:assert/strict";
import { test } from "vitest";
import { discoverColumns, type DatabaseColumn } from "@skriuw/renderer-core/database/columns";
import { createDatabaseRowsSelector, type DatabaseRow } from "@skriuw/renderer-core/database/rows";
import { cellDisplay, displayText, formatDateKey } from "@/features/database/view/values";
import { databaseState } from "../../../../../../packages/renderer-core/src/database/fixtures";

function setup() {
  const state = databaseState();
  const rows = createDatabaseRowsSelector("projects", false)(state);
  const columns = discoverColumns(rows, false);
  function row(noteId: string): DatabaseRow {
    const found = rows.find((entry) => entry.noteId === noteId);
    assert.ok(found, noteId);
    return found;
  }
  function column(key: string): DatabaseColumn {
    const found = columns.find((entry) => entry.key === key);
    assert.ok(found, key);
    return found;
  }
  return { state, row, column };
}

test("select values show the note's own option label and color", () => {
  const { state, row, column } = setup();
  assert.deepEqual(cellDisplay(row("beta"), column("p:status"), state.people), {
    kind: "options",
    options: [{ label: "Done", color: "green" }],
  });
});

test("a property stored under another type shows its raw value as a mismatch", () => {
  const { state, row, column } = setup();
  const display = cellDisplay(row("gamma"), column("p:status"), state.people);
  assert.deepEqual(display, { kind: "mismatch", text: "Blocked", storedType: "text" });
  assert.equal(displayText(display), "Blocked");
});

test("missing checkboxes read as unchecked and numbers keep their alignment hint", () => {
  const { state, row, column } = setup();
  assert.deepEqual(cellDisplay(row("beta"), column("p:shipped"), state.people), {
    kind: "checkbox",
    checked: false,
  });
  assert.deepEqual(cellDisplay(row("alpha"), column("p:priority"), state.people), {
    kind: "text",
    text: "2",
    numeric: true,
  });
  assert.equal(displayText({ kind: "empty" }), "Empty");
});

test("built-in columns describe the note itself", () => {
  const { state, row, column } = setup();
  assert.deepEqual(cellDisplay(row("alpha"), column("title"), state.people), {
    kind: "text",
    text: "Alpha",
  });
  assert.deepEqual(cellDisplay(row("alpha"), column("words"), state.people), {
    kind: "text",
    text: "10",
    numeric: true,
  });
});

test("date keys format as calendar dates and leave anything else alone", () => {
  assert.notEqual(formatDateKey("2026-03-04"), "2026-03-04");
  assert.equal(formatDateKey("soon"), "soon");
});
