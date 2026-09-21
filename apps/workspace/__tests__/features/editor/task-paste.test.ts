import assert from "node:assert/strict";
import test from "node:test";
import { Slice } from "prosemirror-model";
import { productSchema } from "../../../src/features/editor/schema";
import { withFreshPastedTaskIdentities } from "../../../src/features/editor/task-paste";

function sequentialIds(prefix = "fresh") {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

function checkItem(attrs: Record<string, unknown>, text = "Ship it") {
  return productSchema.node("check_item", attrs, [
    productSchema.node("paragraph", null, [productSchema.text(text)]),
  ]);
}

function sliceOf(...items: ReturnType<typeof checkItem>[]) {
  return new Slice(productSchema.node("check_list", null, items).content, 0, 0);
}

test("a pasted linked task gets a fresh identity so the note keeps one link per task", () => {
  const slice = sliceOf(checkItem({ checked: false, taskId: "task-1", blockId: "block-1" }));

  const pasted = withFreshPastedTaskIdentities(slice, sequentialIds());
  const item = pasted.content.firstChild;

  assert.equal(item?.attrs.taskId, "fresh-1");
  assert.equal(item?.attrs.blockId, "fresh-2");
  assert.equal(item?.textContent, "Ship it");
  assert.equal(item?.attrs.checked, false);
});

test("two copies of the same item come back with two distinct identities", () => {
  const item = checkItem({ checked: true, taskId: "task-1", blockId: "block-1" });

  const pasted = withFreshPastedTaskIdentities(sliceOf(item, item), sequentialIds());
  const first = pasted.content.child(0);
  const second = pasted.content.child(1);

  assert.notEqual(first.attrs.taskId, second.attrs.taskId);
  assert.notEqual(first.attrs.blockId, second.attrs.blockId);
  assert.equal(first.attrs.checked, true);
});

test("an unlinked checklist item is returned untouched", () => {
  const slice = sliceOf(checkItem({ checked: false, taskId: null, blockId: null }));

  const pasted = withFreshPastedTaskIdentities(slice, sequentialIds());

  assert.equal(pasted, slice);
  assert.equal(pasted.content.firstChild?.attrs.taskId, null);
});

test("slice open depths and surrounding content survive the rewrite", () => {
  const nested = new Slice(
    productSchema
      .node("doc", null, [
        productSchema.node("paragraph", null, [productSchema.text("before")]),
        productSchema.node("check_list", null, [
          checkItem({ checked: false, taskId: "task-1", blockId: "block-1" }),
        ]),
      ])
      .content,
    1,
    1,
  );

  const pasted = withFreshPastedTaskIdentities(nested, sequentialIds());

  assert.equal(pasted.openStart, 1);
  assert.equal(pasted.openEnd, 1);
  assert.equal(pasted.content.child(0).textContent, "before");
  assert.equal(pasted.content.child(1).firstChild?.attrs.taskId, "fresh-1");
});

test("generated identities never collide with each other", () => {
  const collidingIds = (() => {
    const values = ["same", "same", "distinct"];
    let next = 0;
    return () => values[next++] ?? "tail";
  })();

  const pasted = withFreshPastedTaskIdentities(
    sliceOf(checkItem({ checked: false, taskId: "task-1", blockId: "block-1" })),
    collidingIds,
  );
  const item = pasted.content.firstChild;

  assert.equal(item?.attrs.taskId, "same");
  assert.equal(item?.attrs.blockId, "distinct");
});
