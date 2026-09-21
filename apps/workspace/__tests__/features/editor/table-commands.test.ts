import assert from "node:assert/strict";
import test from "node:test";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  firstTableCellTextPosition,
  isTableCommandAvailable,
  isTableCommandEnabled,
  tableCommands,
  toggleHeaderRow,
} from "../../../src/features/editor/table-commands";
import { parseProductMarkdown, productSchema } from "../../../src/features/editor/schema";

const TABLE = "| Name | Age |\n| --- | --- |\n| Ada | 36 |\n| Bob | 41 |\n";

function firstTable(doc: ProseMirrorNode): ProseMirrorNode {
  const table = doc.child(0);
  assert.equal(table.type.name, "table");
  return table;
}

function stateInCell(row: number, column: number): EditorState {
  const doc = parseProductMarkdown(TABLE);
  const table = firstTable(doc);
  let cellPosition = 2;
  for (let index = 0; index < row; index += 1) cellPosition += table.child(index).nodeSize;
  const selectedRow = table.child(row);
  for (let index = 0; index < column; index += 1) cellPosition += selectedRow.child(index).nodeSize;
  const state = EditorState.create({ doc, schema: productSchema });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, cellPosition + 2)));
}

function apply(state: EditorState, command: Command): EditorState {
  let next = state;
  const handled = command(state, (transaction) => {
    next = state.apply(transaction);
  });
  assert.equal(handled, true);
  return next;
}

test("table commands expose stable menu labels", () => {
  assert.deepEqual(
    tableCommands.map(({ id, label }) => ({ id, label })),
    [
      { id: "add-row-before", label: "Add row above" },
      { id: "add-row-after", label: "Add row below" },
      { id: "delete-row", label: "Delete row" },
      { id: "add-column-before", label: "Add column left" },
      { id: "add-column-after", label: "Add column right" },
      { id: "delete-column", label: "Delete column" },
      { id: "toggle-header-row", label: "Toggle header row" },
      { id: "delete-table", label: "Delete table" },
    ],
  );
});

test("table commands only report available inside a table", () => {
  const outside = EditorState.create({
    schema: productSchema,
    doc: productSchema.node("doc", null, [productSchema.node("paragraph", null, productSchema.text("outside"))]),
  });
  const inside = stateInCell(1, 0);

  assert.equal(isTableCommandAvailable(outside), false);
  assert.equal(isTableCommandAvailable(inside), true);
  for (const command of tableCommands) {
    assert.equal(isTableCommandEnabled(outside, command), false, command.id);
    assert.equal(command.command(outside, undefined), false, command.id);
  }
});

test("firstTableCellTextPosition finds the first editable cell after a preceding block", () => {
  const doc = parseProductMarkdown(`Intro\n\n${TABLE}`);
  const state = EditorState.create({ doc, schema: productSchema });
  const tablePosition = doc.child(0).nodeSize;
  const position = firstTableCellTextPosition(state, tablePosition);

  assert.notEqual(position, null);
  const selection = TextSelection.create(doc, position);
  assert.equal(selection.$from.parent.type.name, "paragraph");
  assert.equal(selection.$from.parent.textContent, "Name");
});

test("firstTableCellTextPosition rejects non-table and non-top-level positions", () => {
  const doc = parseProductMarkdown(`Intro\n\n${TABLE}`);
  const state = EditorState.create({ doc, schema: productSchema });
  const tablePosition = doc.child(0).nodeSize;

  assert.equal(firstTableCellTextPosition(state, 0), null);
  assert.equal(firstTableCellTextPosition(state, tablePosition + 1), null);
  assert.equal(firstTableCellTextPosition(state, state.doc.content.size + 1), null);
});

test("row and column commands preserve a valid rectangular table", () => {
  const withRowBefore = apply(stateInCell(1, 0), addRowBefore);
  assert.equal(firstTable(withRowBefore.doc).childCount, 4);

  const withRowAfter = apply(stateInCell(1, 0), addRowAfter);
  assert.equal(firstTable(withRowAfter.doc).childCount, 4);

  const withColumnBefore = apply(stateInCell(1, 0), addColumnBefore);
  firstTable(withColumnBefore.doc).forEach((row) => assert.equal(row.childCount, 3));

  const withColumnAfter = apply(stateInCell(1, 0), addColumnAfter);
  firstTable(withColumnAfter.doc).forEach((row) => assert.equal(row.childCount, 3));

  withRowBefore.doc.check();
  withRowAfter.doc.check();
  withColumnBefore.doc.check();
  withColumnAfter.doc.check();
});

test("row and column deletion update the selected table only", () => {
  const withoutRow = apply(stateInCell(1, 0), deleteRow);
  assert.equal(firstTable(withoutRow.doc).childCount, 2);

  const withoutColumn = apply(stateInCell(1, 0), deleteColumn);
  firstTable(withoutColumn.doc).forEach((row) => assert.equal(row.childCount, 1));

  withoutRow.doc.check();
  withoutColumn.doc.check();
});

test("toggling a row header changes its cells between body and header cells", () => {
  const withHeader = apply(stateInCell(1, 0), toggleHeaderRow);
  const row = firstTable(withHeader.doc).child(1);
  row.forEach((cell) => assert.equal(cell.type.name, "table_header"));

  const withoutHeader = apply(withHeader, toggleHeaderRow);
  firstTable(withoutHeader.doc).child(1).forEach((cell) => {
    assert.equal(cell.type.name, "table_cell");
  });
});

test("delete table removes the selected table and leaves a valid document", () => {
  const next = apply(stateInCell(1, 0), deleteTable);

  assert.equal(next.doc.childCount, 1);
  assert.notEqual(next.doc.firstChild?.type.name, "table");
  next.doc.check();
});
