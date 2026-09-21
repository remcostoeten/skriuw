import assert from "node:assert/strict";
import test from "node:test";
import { findBlockLocation } from "../../../src/features/editor/block-locations";
import { productSchema } from "../../../src/features/editor/schema";

function paragraph(text: string) {
  return productSchema.node("paragraph", null, [productSchema.text(text)]);
}

function checkList(...blockIds: string[]) {
  return productSchema.node(
    "check_list",
    null,
    blockIds.map((blockId) =>
      productSchema.node("check_item", { checked: false, taskId: `task-${blockId}`, blockId }, [
        paragraph(`Item ${blockId}`),
      ]),
    ),
  );
}

test("a nested check item resolves to its position and its top-level block index", () => {
  const document = productSchema.node("doc", null, [
    paragraph("intro"),
    paragraph("more"),
    checkList("block-1", "block-2"),
  ]);

  const location = findBlockLocation(document, "block-2");

  assert.ok(location);
  assert.equal(location.blockIndex, 2);
  assert.equal(document.nodeAt(location.position)?.attrs.blockId, "block-2");
});

test("the first top-level block is found at index zero", () => {
  const document = productSchema.node("doc", null, [checkList("block-1"), paragraph("after")]);

  const location = findBlockLocation(document, "block-1");

  assert.equal(location?.blockIndex, 0);
  assert.equal(document.nodeAt(location!.position)?.attrs.blockId, "block-1");
});

test("an unknown block id resolves to nothing", () => {
  const document = productSchema.node("doc", null, [checkList("block-1")]);

  assert.equal(findBlockLocation(document, "block-9"), null);
});
