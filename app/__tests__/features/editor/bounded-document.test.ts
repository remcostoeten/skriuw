import assert from "node:assert/strict";
import test from "node:test";
import {
  BOUNDED_BLOCK_LIMIT,
  BOUNDED_HISTORY_DEPTH,
  createBoundedDocument,
  shouldUseBoundedEditor,
  topLevelBlockAtPosition,
  topLevelTextPosition,
} from "../../../src/features/editor/bounded-document";
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

function createDrawnDocument(count: number, drawing: unknown) {
  return productSchema.node(
    "doc",
    { drawing },
    Array.from({ length: count }, (_, index) =>
      productSchema.node("paragraph", null, productSchema.text(`block ${index}`)),
    ),
  );
}

const INK = {
  version: 1,
  elements: [
    { id: "s1", kind: "stroke", tool: "pen", color: "ink", width: 2, points: [0, 0, 4, 4] },
  ],
};

test("a bounded note keeps its annotation layer through every rebuild", () => {
  const bounded = createBoundedDocument(createDrawnDocument(400, INK));

  assert.deepEqual(bounded.fullDocument().attrs.drawing, INK);
  assert.deepEqual(bounded.windowDocument().attrs.drawing, INK);

  bounded.moveWindow(120);
  const edited = bounded.windowDocument();
  bounded.replaceWindow(
    productSchema.node("doc", edited.attrs, [
      productSchema.node("paragraph", null, productSchema.text("edited")),
      ...Array.from({ length: edited.childCount - 1 }, (_, index) => edited.child(index + 1)),
    ]),
    1,
  );

  assert.deepEqual(
    bounded.fullDocument().attrs.drawing,
    INK,
    "editing text off the drawing must not erase the layer",
  );
});

test("a drawing-only edit is recorded and undoes without touching the text", () => {
  const bounded = createBoundedDocument(createDrawnDocument(400, null));
  const before = bounded.fullDocument();

  const changed = bounded.replaceWindow(
    productSchema.node("doc", { drawing: INK }, bounded.windowDocument().content),
    1,
  );

  assert.equal(changed, true, "an attributes-only change still changes the document");
  assert.deepEqual(bounded.fullDocument().attrs.drawing, INK);
  assert.equal(bounded.undoDepth(), 1);

  assert.equal(bounded.undo(), true);
  assert.equal(bounded.fullDocument().attrs.drawing, null);
  assert.equal(bounded.fullDocument().content.eq(before.content), true);

  assert.equal(bounded.redo(), true);
  assert.deepEqual(bounded.fullDocument().attrs.drawing, INK);
});

test("reconciling an external write adopts its annotation layer", () => {
  const bounded = createBoundedDocument(createDrawnDocument(400, INK));

  bounded.reconcile(createDrawnDocument(400, null));

  assert.equal(bounded.fullDocument().attrs.drawing, null);
});

test("adoptRemoteDocument shifts later undo entries and drops the ones the change overlaps", () => {
  const bounded = createBoundedDocument(createDocument(400));
  const window = bounded.windowDocument();
  const edited = (index: number, text: string, at: number) => {
    const replacement = productSchema.node(
      "doc",
      null,
      Array.from({ length: window.childCount }, (_, position) =>
        position === index
          ? productSchema.node("paragraph", null, productSchema.text(text))
          : bounded.windowDocument().child(position),
      ),
    );
    assert.equal(bounded.replaceWindow(replacement, at), true);
  };
  edited(10, "local ten", 1_000);
  edited(100, "local hundred", 5_000);
  assert.equal(bounded.undoDepth(), 2);
  bounded.rememberSelection({ blockIndex: 100, offset: 3 });

  const remoteBlocks = () => {
    const blocks: ReturnType<typeof window.child>[] = [];
    bounded.fullDocument().forEach((block) => blocks.push(block));
    return blocks;
  };
  const inserted = remoteBlocks();
  inserted.splice(5, 0, productSchema.node("paragraph", null, productSchema.text("remote inserted")));
  assert.equal(bounded.adoptRemoteDocument(productSchema.node("doc", null, inserted)), true);
  assert.equal(bounded.blockCount(), 401);
  assert.equal(bounded.fullDocument().child(5).textContent, "remote inserted");
  assert.equal(bounded.fullDocument().child(11).textContent, "local ten");
  assert.equal(bounded.fullDocument().child(101).textContent, "local hundred");
  assert.equal(bounded.undoDepth(), 2, "entries after an insertion survive, shifted");
  assert.deepEqual(bounded.selection(), { blockIndex: 101, offset: 3 });

  const overwritten = remoteBlocks();
  overwritten.splice(101, 1, productSchema.node("paragraph", null, productSchema.text("remote hundred")));
  assert.equal(bounded.adoptRemoteDocument(productSchema.node("doc", null, overwritten)), true);
  assert.equal(bounded.undoDepth(), 1, "the entry the remote change overwrote is gone");
  assert.deepEqual(bounded.selection(), { blockIndex: 101, offset: 0 });
  assert.equal(bounded.undo(), true);
  assert.equal(bounded.fullDocument().child(11).textContent, "block 10");
  assert.equal(bounded.fullDocument().child(101).textContent, "remote hundred");
});

test("adoptRemoteDocument keeps the window on its blocks when the change lies before it", () => {
  const bounded = createBoundedDocument(createDocument(600));
  bounded.moveWindow(300);
  const before = bounded.windowDocument();
  const remote = bounded.fullDocument();
  const blocks: ReturnType<typeof remote.child>[] = [];
  remote.forEach((block) => blocks.push(block));
  blocks.splice(2, 1);
  blocks.splice(2, 0, productSchema.node("paragraph", null, productSchema.text("one")));
  blocks.splice(3, 0, productSchema.node("paragraph", null, productSchema.text("two")));

  const windowChanged = bounded.adoptRemoteDocument(productSchema.node("doc", null, blocks));

  assert.equal(windowChanged, false);
  assert.equal(bounded.windowStart(), 301);
  assert.ok(bounded.windowDocument().eq(before));
});

test("adoptRemoteDocument reports an attribute-only change so the layer reaches the editor", () => {
  const bounded = createBoundedDocument(createDocument(300));
  const drawn = productSchema.node("doc", { drawing: "{}" }, bounded.fullDocument().content);
  assert.equal(bounded.adoptRemoteDocument(drawn), true);
  assert.equal(bounded.fullDocument().attrs.drawing, "{}");
  assert.equal(bounded.undoDepth(), 0);
});
