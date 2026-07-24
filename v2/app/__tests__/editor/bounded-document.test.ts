import assert from "node:assert/strict";
import test from "node:test";
import {
  BOUNDED_BLOCK_LIMIT,
  BOUNDED_HISTORY_DEPTH,
  createBoundedDocument,
  shouldUseBoundedEditor,
  topLevelBlockAtPosition,
  topLevelTextPosition,
} from "../../src/editor/bounded-document";
import { productSchema } from "../../src/editor/schema";

function createDocument(count: number) {
  return productSchema.node(
    "doc",
    null,
    Array.from({ length: count }, (_, index) =>
      productSchema.node("paragraph", null, productSchema.text(`block ${index}`)),
    ),
  );
}

test("the bounded path activates above the measured 192-block threshold", () => {
  assert.equal(shouldUseBoundedEditor(createDocument(192)), false);
  assert.equal(shouldUseBoundedEditor(createDocument(193)), true);
});

test("window movement never renders more than 192 canonical blocks", () => {
  const bounded = createBoundedDocument(createDocument(2_000));
  assert.equal(bounded.windowDocument().childCount, BOUNDED_BLOCK_LIMIT);
  assert.equal(bounded.moveWindow(1_900), true);
  assert.equal(bounded.windowStart(), 1_808);
  assert.equal(bounded.windowEnd(), 2_000);
  assert.equal(bounded.windowDocument().firstChild?.textContent, "block 1808");
  assert.equal(bounded.fullDocument().childCount, 2_000);
});

test("window edits reconcile into the full structured document", () => {
  const bounded = createBoundedDocument(createDocument(500));
  bounded.moveWindow(250);
  const window = bounded.windowDocument();
  const replacement = productSchema.node(
    "doc",
    null,
    Array.from({ length: window.childCount }, (_, index) =>
      index === 4
        ? productSchema.node("heading", { level: 3 }, productSchema.text("changed"))
        : window.child(index),
    ),
  );
  assert.equal(bounded.replaceWindow(replacement, 1_000), true);
  const changed = bounded.fullDocument().child(254);
  assert.equal(changed.type.name, "heading");
  assert.equal(changed.attrs.level, 3);
  assert.equal(changed.textContent, "changed");
});

test("bounded undo groups bursts, retains compact ranges, and caps history", () => {
  const bounded = createBoundedDocument(createDocument(500));
  for (let index = 0; index < BOUNDED_HISTORY_DEPTH + 10; index += 1) {
    const window = bounded.windowDocument();
    const changed = productSchema.node(
      "doc",
      null,
      Array.from({ length: window.childCount }, (_, child) =>
        child === index % window.childCount
          ? productSchema.node("paragraph", null, productSchema.text(`edit ${index}`))
          : window.child(child),
      ),
    );
    bounded.replaceWindow(changed, index * 1_000);
  }
  assert.equal(bounded.undoDepth(), BOUNDED_HISTORY_DEPTH);
  assert.equal(bounded.undo(), true);
  assert.equal(bounded.redoDepth(), 1);
  assert.equal(bounded.redo(), true);

  const burst = createBoundedDocument(createDocument(500));
  for (let index = 0; index < 4; index += 1) {
    const window = burst.windowDocument();
    const changed = productSchema.node(
      "doc",
      null,
      [
        productSchema.node("paragraph", null, productSchema.text(`burst ${index}`)),
        ...Array.from({ length: window.childCount - 1 }, (_, child) => window.child(child + 1)),
      ],
    );
    burst.replaceWindow(changed, 1_000 + index * 100);
  }
  assert.equal(burst.undoDepth(), 1);
  assert.equal(burst.undo(), true);
  assert.equal(burst.fullDocument().firstChild?.textContent, "block 0");
});

test("full-document replacement and external reconciliation cover off-window content", () => {
  const bounded = createBoundedDocument(createDocument(500));
  const replacement = createDocument(600);
  assert.equal(bounded.replaceFullDocument(replacement, 1_000), true);
  assert.equal(bounded.fullDocument().childCount, 600);
  bounded.moveWindow(408);
  assert.equal(bounded.windowDocument().lastChild?.textContent, "block 599");

  const external = createDocument(300);
  bounded.reconcile(external);
  assert.equal(bounded.fullDocument().childCount, 300);
  assert.equal(bounded.windowStart(), 108);
  assert.equal(bounded.undoDepth(), 0);
});

test("canonical positions map to top-level blocks and text offsets", () => {
  const document = createDocument(10);
  const position = topLevelTextPosition(document, 7, 3);
  assert.equal(topLevelBlockAtPosition(document, position), 7);
});
