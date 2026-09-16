import assert from "node:assert/strict";
import test from "node:test";
import { parseProductMarkdown } from "../../../src/features/editor/schema";
import { buildDisplayRowLayout, displayRowAt, displayRowPosition } from "../../../src/features/editor/display-rows";
import { ROW_HEIGHT, wrappedLayout } from "./vim/wrapped-layout";

const rowHeight = () => ROW_HEIGHT;

test("the layout counts every wrapped row, not every Markdown line", () => {
  const doc = parseProductMarkdown("# Title\n\nabcdefghijklmnopqrstuvwxyz\n\nxy");
  const layout = buildDisplayRowLayout(doc, wrappedLayout(doc, 10), rowHeight);
  assert.deepEqual(layout.counts, [1, 3, 1]);
  assert.deepEqual(layout.starts, [1, 2, 5]);
  assert.equal(layout.total, 5);
});

test("the caret's row is numbered across the whole document", () => {
  const doc = parseProductMarkdown("# Title\n\nabcdefghijklmnopqrstuvwxyz\n\nxy");
  const measure = wrappedLayout(doc, 10);
  const layout = buildDisplayRowLayout(doc, measure, rowHeight);
  const paragraph = 1 + doc.child(0).nodeSize;
  assert.equal(displayRowAt(doc, layout, measure, rowHeight, 1), 1);
  assert.equal(displayRowAt(doc, layout, measure, rowHeight, paragraph + 12), 3);
  assert.equal(displayRowAt(doc, layout, measure, rowHeight, paragraph + 25), 4);
  assert.equal(displayRowAt(doc, layout, measure, rowHeight, doc.content.size - 1), 5);
});

test("a row number lands at the start of that wrapped row and clamps into the document", () => {
  const doc = parseProductMarkdown("# Title\n\nabcdefghijklmnopqrstuvwxyz\n\nxy");
  const measure = wrappedLayout(doc, 10);
  const layout = buildDisplayRowLayout(doc, measure, rowHeight);
  const paragraph = 1 + doc.child(0).nodeSize;
  assert.equal(doc.textBetween(displayRowPosition(doc, layout, measure, 3), displayRowPosition(doc, layout, measure, 3) + 1), "k");
  assert.equal(displayRowPosition(doc, layout, measure, 2), paragraph);
  assert.equal(doc.textBetween(displayRowPosition(doc, layout, measure, 99), displayRowPosition(doc, layout, measure, 99) + 1), "x");
  assert.equal(displayRowPosition(doc, layout, measure, 0), 1);
});

test("a view without layout still counts one row per line", () => {
  const doc = parseProductMarkdown("abcdefghijklmnopqrstuvwxyz\n\nxy");
  const layout = buildDisplayRowLayout(doc, () => null, () => null);
  assert.equal(layout.total, 2);
  assert.equal(displayRowAt(doc, layout, () => null, () => null, 5), 1);
});
