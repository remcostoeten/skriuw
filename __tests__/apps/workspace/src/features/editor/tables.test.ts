import assert from "node:assert/strict";
import { test } from "vitest";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";

const PIPE_TABLE = "| Name | Age |\n| --- | --- |\n| Ada | 36 |\n| Bob | 41 |\n";

function firstTable(doc: ProseMirrorNode): ProseMirrorNode {
  const table = doc.child(0);
  assert.equal(table.type.name, "table");
  return table;
}

function cellText(row: ProseMirrorNode): string[] {
  const texts: string[] = [];
  row.forEach((cell) => texts.push(cell.textContent));
  return texts;
}

test("a GFM pipe table parses into table rows with header cells", () => {
  const table = firstTable(parseProductMarkdown(PIPE_TABLE));

  assert.equal(table.childCount, 3);
  assert.equal(table.child(0).child(0).type.name, "table_header");
  assert.equal(table.child(1).child(0).type.name, "table_cell");
  assert.deepEqual(cellText(table.child(0)), ["Name", "Age"]);
  assert.deepEqual(cellText(table.child(1)), ["Ada", "36"]);
  assert.deepEqual(cellText(table.child(2)), ["Bob", "41"]);
});

test("table cells hold block content rather than bare text", () => {
  const table = firstTable(parseProductMarkdown(PIPE_TABLE));
  const cell = table.child(0).child(0);

  assert.equal(cell.childCount, 1);
  assert.equal(cell.firstChild?.type.name, "paragraph");
});

test("a table serializes back to a GFM pipe table", () => {
  const serialized = serializeProductMarkdown(parseProductMarkdown(PIPE_TABLE));

  assert.equal(serialized, PIPE_TABLE);
});

test("inline marks and escaped pipes survive the round trip", () => {
  const source = "| a **b** | c\\|d |\n| --- | --- |\n| 1 | 2 |\n";
  const doc = parseProductMarkdown(source);
  const table = firstTable(doc);

  assert.deepEqual(cellText(table.child(0)), ["a b", "c|d"]);
  assert.equal(serializeProductMarkdown(doc), source);
});

test("parse then serialize is a fixpoint, including around other blocks", () => {
  const source = "intro\n\n| a | b |\n| :-- | --: |\n| 1 | 2 |\n\nafter\n";
  const once = serializeProductMarkdown(parseProductMarkdown(source));
  const twice = serializeProductMarkdown(parseProductMarkdown(once));

  assert.equal(once, twice);
  assert.ok(once.includes("| --- | --- |"));
});

test("cells that cannot be a pipe table degrade to flattened inline text", () => {
  function paragraph(text: string) {
    return productSchema.node("paragraph", null, productSchema.text(text));
  }
  function listItem(text: string) {
    return productSchema.node("list_item", null, paragraph(text));
  }
  const table = productSchema.node("table", null, [
    productSchema.node("table_row", null, [
      productSchema.node("table_header", null, paragraph("H")),
    ]),
    productSchema.node("table_row", null, [
      productSchema.node("table_cell", null, [
        productSchema.node("bullet_list", null, [listItem("one"), listItem("two")]),
      ]),
    ]),
    productSchema.node("table_row", null, [
      productSchema.node("table_cell", null, [paragraph("first"), paragraph("second")]),
    ]),
  ]);
  const serialized = serializeProductMarkdown(productSchema.node("doc", null, [table]));

  assert.equal(serialized, "| H |\n| --- |\n| one two |\n| first second |\n");
  assert.equal(serializeProductMarkdown(parseProductMarkdown(serialized)), serialized);
});

test("table markdown keeps working alongside check lists", () => {
  const source = "- [ ] todo\n\n| a |\n| --- |\n| b |\n";
  const doc = parseProductMarkdown(source);

  assert.equal(doc.child(0).type.name, "check_list");
  assert.equal(doc.child(1).type.name, "table");
  assert.equal(serializeProductMarkdown(doc), source);
});
