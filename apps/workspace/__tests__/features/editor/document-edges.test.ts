import assert from "node:assert/strict";
import test from "node:test";
import { BOUNDED_BLOCK_LIMIT } from "../../../src/features/editor/bounded-document";
import {
  documentEdgeSelection,
  documentEdgeWindowStart,
  textEdgeOffset,
} from "../../../src/features/editor/document-edges";
import { productSchema } from "../../../src/features/editor/schema";

function createDocument(count: number) {
  return productSchema.node(
    "doc",
    null,
    Array.from({ length: count }, (_, index) =>
      productSchema.node("paragraph", null, productSchema.text(`block ${index}`)),
    ),
  );
}

test("edge selections land inside the first and last text block", () => {
  const document = createDocument(3);
  const start = documentEdgeSelection(document, "start");
  const end = documentEdgeSelection(document, "end");

  assert.equal(start.empty, true);
  assert.equal(end.empty, true);
  assert.equal(start.from, 1);
  assert.equal(end.to, document.content.size - 1);
  assert.equal(document.resolve(start.from).parent.textContent, "block 0");
  assert.equal(document.resolve(end.to).parent.textContent, "block 2");
});

test("an empty document still resolves both edges to the same caret", () => {
  const document = productSchema.node("doc", null, [productSchema.node("paragraph")]);
  assert.equal(documentEdgeSelection(document, "start").from, 1);
  assert.equal(documentEdgeSelection(document, "end").to, 1);
});

test("the end edge scrolls a bounded window to the last block, the start edge to the first", () => {
  assert.equal(documentEdgeWindowStart(2_000, BOUNDED_BLOCK_LIMIT, "start"), 0);
  assert.equal(
    documentEdgeWindowStart(2_000, BOUNDED_BLOCK_LIMIT, "end"),
    2_000 - BOUNDED_BLOCK_LIMIT,
  );
});

test("a document shorter than the window never asks for a negative start", () => {
  assert.equal(documentEdgeWindowStart(12, BOUNDED_BLOCK_LIMIT, "end"), 0);
  assert.equal(documentEdgeWindowStart(0, BOUNDED_BLOCK_LIMIT, "end"), 0);
});

test("raw Markdown edges are the ends of the source text", () => {
  assert.equal(textEdgeOffset("one\ntwo", "start"), 0);
  assert.equal(textEdgeOffset("one\ntwo", "end"), 7);
  assert.equal(textEdgeOffset("", "end"), 0);
});
