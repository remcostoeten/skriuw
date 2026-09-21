import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import {
  blockIndexAt,
  deleteBlock,
  duplicateBlock,
  insertBlockAfter,
  moveBlock,
  moveBlockToIndex,
  moveSelectedBlock,
  selectBlockThenDocument,
  topLevelBlockAt,
} from "../../../src/features/editor/block-commands";
import { productSchema, serializeProductMarkdown } from "../../../src/features/editor/schema";

function paragraph(text: string) {
  return productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []);
}

function stateWith(...blocks: ReturnType<typeof paragraph>[]): EditorState {
  return EditorState.create({ doc: productSchema.node("doc", null, blocks) });
}

function apply(state: EditorState, command: ReturnType<typeof deleteBlock>): EditorState {
  let next = state;
  const handled = command(state, (transaction) => {
    next = state.apply(transaction);
  });
  assert.equal(handled, true, "command should report that it applied");
  return next;
}

function blockTexts(state: EditorState): string[] {
  const texts: string[] = [];
  state.doc.forEach((node) => texts.push(node.textContent));
  return texts;
}

test("topLevelBlockAt resolves a position inside a nested list to its top-level block", () => {
  const list = productSchema.node("bullet_list", null, [
    productSchema.node("list_item", null, [paragraph("nested")]),
  ]);
  const state = stateWith(paragraph("first"), list as never);
  const insideNested = state.doc.content.size - 3;
  const block = topLevelBlockAt(state.doc, insideNested);
  assert.ok(block);
  assert.equal(block.node.type.name, "bullet_list");
  assert.equal(blockIndexAt(state.doc, insideNested), 1);
});

test("topLevelBlockAt resolves a position between blocks to the following block", () => {
  const state = stateWith(paragraph("one"), paragraph("two"));
  const between = state.doc.child(0).nodeSize;
  const block = topLevelBlockAt(state.doc, between);
  assert.ok(block);
  assert.equal(block.node.textContent, "two");
});

test("duplicateBlock inserts a copy directly after the source block", () => {
  const state = stateWith(paragraph("one"), paragraph("two"));
  const next = apply(state, duplicateBlock(1));
  assert.deepEqual(blockTexts(next), ["one", "one", "two"]);
  assert.ok(next.selection instanceof NodeSelection);
});

test("deleteBlock removes the block and keeps the rest of the document", () => {
  const state = stateWith(paragraph("one"), paragraph("two"), paragraph("three"));
  const second = state.doc.child(0).nodeSize + 1;
  const next = apply(state, deleteBlock(second));
  assert.deepEqual(blockTexts(next), ["one", "three"]);
});

test("deleteBlock on the only block leaves an empty paragraph rather than an invalid doc", () => {
  const state = stateWith(paragraph("only"));
  const next = apply(state, deleteBlock(1));
  assert.equal(next.doc.childCount, 1);
  assert.equal(next.doc.firstChild?.type.name, "paragraph");
  assert.equal(next.doc.textContent, "");
  next.doc.check();
});

test("insertBlockAfter adds an empty paragraph below and puts the cursor in it", () => {
  const state = stateWith(paragraph("one"), paragraph("two"));
  const next = apply(state, insertBlockAfter(1));
  assert.deepEqual(blockTexts(next), ["one", "", "two"]);
  assert.equal(next.selection.$from.parent.type.name, "paragraph");
  assert.equal(next.selection.$from.parent.textContent, "");
});

test("moveBlock swaps a block with its neighbour in both directions", () => {
  const state = stateWith(paragraph("one"), paragraph("two"), paragraph("three"));
  const secondPos = state.doc.child(0).nodeSize + 1;
  assert.deepEqual(blockTexts(apply(state, moveBlock(secondPos, -1))), [
    "two",
    "one",
    "three",
  ]);
  assert.deepEqual(blockTexts(apply(state, moveBlock(secondPos, 1))), [
    "one",
    "three",
    "two",
  ]);
});

test("moveBlock refuses to move past either end of the document", () => {
  const state = stateWith(paragraph("one"), paragraph("two"));
  assert.equal(moveBlock(1, -1)(state, undefined), false);
  assert.equal(moveBlock(state.doc.content.size - 1, 1)(state, undefined), false);
});

test("moveBlock moves whole lists, not individual items", () => {
  const list = productSchema.node("bullet_list", null, [
    productSchema.node("list_item", null, [paragraph("a")]),
    productSchema.node("list_item", null, [paragraph("b")]),
  ]);
  const state = stateWith(paragraph("intro"), list as never);
  const insideList = state.doc.content.size - 3;
  const next = apply(state, moveBlock(insideList, -1));
  assert.equal(next.doc.child(0).type.name, "bullet_list");
  assert.equal(next.doc.child(1).textContent, "intro");
  next.doc.check();
});

test("moveBlock keeps the text cursor on the block it moved", () => {
  const state = stateWith(paragraph("one"), paragraph("two"));
  const cursor = state.doc.child(0).nodeSize + 2;
  const selected = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, cursor)),
  );
  const next = apply(selected, moveSelectedBlock(-1));
  assert.deepEqual(blockTexts(next), ["two", "one"]);
  assert.equal(next.selection.$from.parent.textContent, "two");
});

test("selectBlockThenDocument selects the block on the first press and the document on the second", () => {
  const state = stateWith(paragraph("one"), paragraph("two"));
  const cursor = state.doc.child(0).nodeSize + 2;
  const placed = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursor)));

  const block = apply(placed, selectBlockThenDocument());
  assert.equal(block.doc.textBetween(block.selection.from, block.selection.to), "two");

  const document = apply(block, selectBlockThenDocument());
  assert.equal(document.selection.from, 0);
  assert.equal(document.selection.to, document.doc.content.size);
});

test("selectBlockThenDocument selects the enclosing list item paragraph, not the whole list", () => {
  const list = productSchema.node("bullet_list", null, [
    productSchema.node("list_item", null, [paragraph("a")]),
    productSchema.node("list_item", null, [paragraph("b")]),
  ]);
  const state = stateWith(list as never);
  const insideFirstItem = 4;
  const placed = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, insideFirstItem)),
  );
  const next = apply(placed, selectBlockThenDocument());
  assert.equal(next.doc.textBetween(next.selection.from, next.selection.to), "a");
});

test("selectBlockThenDocument falls through to the document from an empty block", () => {
  const state = stateWith(paragraph(""), paragraph("two"));
  const next = apply(state, selectBlockThenDocument());
  assert.equal(next.selection.from, 0);
  assert.equal(next.selection.to, next.doc.content.size);
});

test("a reordered document round-trips through the markdown serializer", () => {
  const state = stateWith(paragraph("alpha"), paragraph("beta"), paragraph("gamma"));
  const secondPos = state.doc.child(0).nodeSize + 1;
  const next = apply(state, moveBlock(secondPos, 1));
  next.doc.check();
  assert.equal(serializeProductMarkdown(next.doc), "alpha\n\ngamma\n\nbeta");
});

/**
 * The drag grip resolves a drop to a gap index between top-level blocks, so
 * these cases cover the gap arithmetic the pointer drag depends on.
 */
test("moveBlockToIndex drops a block at the end of the document", () => {
  const state = stateWith(paragraph("one"), paragraph("two"), paragraph("three"));
  const next = apply(state, moveBlockToIndex(1, 3));
  assert.deepEqual(blockTexts(next), ["two", "three", "one"]);
  next.doc.check();
});

test("moveBlockToIndex drops a block at the top of the document", () => {
  const state = stateWith(paragraph("one"), paragraph("two"), paragraph("three"));
  const last = state.doc.content.size - 1;
  const next = apply(state, moveBlockToIndex(last, 0));
  assert.deepEqual(blockTexts(next), ["three", "one", "two"]);
  next.doc.check();
});

test("moveBlockToIndex shifts a block down past exactly one neighbour", () => {
  const state = stateWith(paragraph("one"), paragraph("two"), paragraph("three"));
  const next = apply(state, moveBlockToIndex(1, 2));
  assert.deepEqual(blockTexts(next), ["two", "one", "three"]);
});

test("moveBlockToIndex treats both gaps adjacent to the block as no-ops", () => {
  const state = stateWith(paragraph("one"), paragraph("two"), paragraph("three"));
  const second = state.doc.child(0).nodeSize;
  assert.equal(moveBlockToIndex(second, 1)(state, undefined), false);
  assert.equal(moveBlockToIndex(second, 2)(state, undefined), false);
});

test("moveBlockToIndex rejects a gap index outside the document", () => {
  const state = stateWith(paragraph("one"), paragraph("two"));
  assert.equal(moveBlockToIndex(1, -1)(state, undefined), false);
  assert.equal(moveBlockToIndex(1, 3)(state, undefined), false);
});

test("moveBlockToIndex moves a whole list and keeps its items intact", () => {
  const list = productSchema.node("bullet_list", null, [
    productSchema.node("list_item", null, [paragraph("a")]),
    productSchema.node("list_item", null, [paragraph("b")]),
  ]);
  const state = stateWith(paragraph("intro"), list as never, paragraph("outro"));
  const listPos = state.doc.child(0).nodeSize;
  const next = apply(state, moveBlockToIndex(listPos, 0));
  next.doc.check();
  assert.equal(next.doc.child(0).type.name, "bullet_list");
  assert.equal(next.doc.child(0).childCount, 2);
  assert.deepEqual(blockTexts(next).slice(1), ["intro", "outro"]);
});

test("a drag-reordered document round-trips through the markdown serializer", () => {
  const state = stateWith(paragraph("alpha"), paragraph("beta"), paragraph("gamma"));
  const next = apply(state, moveBlockToIndex(1, 3));
  assert.equal(serializeProductMarkdown(next.doc), "beta\n\ngamma\n\nalpha");
});
