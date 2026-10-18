import assert from "node:assert/strict";
import { test } from "vitest";
import {
  nextCardPosition,
  nextGridPosition,
  ratingKey,
  type GridKey,
} from "@/features/database/view/grid-keys";

function key(name: string, modifiers: Partial<GridKey> = {}): GridKey {
  return {
    key: name,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

test("arrow keys step one cell and stop at the grid's edges", () => {
  const start = { row: 1, column: 1 };
  assert.deepEqual(nextGridPosition(key("ArrowDown"), start, 4, 3, 2), { row: 2, column: 1 });
  assert.deepEqual(nextGridPosition(key("ArrowLeft"), start, 4, 3, 2), { row: 1, column: 0 });
  assert.deepEqual(nextGridPosition(key("ArrowUp"), { row: 0, column: 0 }, 4, 3, 2), {
    row: 0,
    column: 0,
  });
  assert.deepEqual(nextGridPosition(key("ArrowRight"), { row: 0, column: 2 }, 4, 3, 2), {
    row: 0,
    column: 2,
  });
});

test("home, end, mod variants and page keys reach the far cells", () => {
  const start = { row: 2, column: 1 };
  assert.deepEqual(nextGridPosition(key("Home"), start, 10, 4, 3), { row: 2, column: 0 });
  assert.deepEqual(nextGridPosition(key("End"), start, 10, 4, 3), { row: 2, column: 3 });
  assert.deepEqual(nextGridPosition(key("Home", { ctrlKey: true }), start, 10, 4, 3), {
    row: 0,
    column: 0,
  });
  assert.deepEqual(nextGridPosition(key("End", { metaKey: true }), start, 10, 4, 3), {
    row: 9,
    column: 3,
  });
  assert.deepEqual(nextGridPosition(key("ArrowDown", { ctrlKey: true }), start, 10, 4, 3), {
    row: 9,
    column: 1,
  });
  assert.deepEqual(nextGridPosition(key("PageDown"), start, 10, 4, 3), { row: 5, column: 1 });
  assert.deepEqual(nextGridPosition(key("PageUp"), start, 10, 4, 3), { row: 0, column: 1 });
});

test("other keys, alt combinations and an empty grid do not navigate", () => {
  const start = { row: 1, column: 1 };
  assert.equal(nextGridPosition(key("a"), start, 4, 3, 2), null);
  assert.equal(nextGridPosition(key("ArrowDown", { altKey: true }), start, 4, 3, 2), null);
  assert.equal(nextGridPosition(key("ArrowDown"), start, 0, 3, 2), null);
});

test("digits 0 to 5 set a rating unless a modifier is held", () => {
  assert.equal(ratingKey(key("3")), 3);
  assert.equal(ratingKey(key("0")), 0);
  assert.equal(ratingKey(key("6")), null);
  assert.equal(ratingKey(key("3", { ctrlKey: true })), null);
});

test("card focus moves within a group and across to the next non-empty group", () => {
  const sizes = [2, 0, 3];
  assert.deepEqual(nextCardPosition("ArrowDown", 0, 1, sizes), [0, 1]);
  assert.deepEqual(nextCardPosition("ArrowUp", 0, 1, sizes), [0, 0]);
  assert.deepEqual(nextCardPosition("End", 2, 0, sizes), [2, 2]);
  assert.deepEqual(nextCardPosition("ArrowRight", 0, 1, sizes), [2, 1]);
  assert.deepEqual(nextCardPosition("ArrowLeft", 2, 2, sizes), [0, 1]);
  assert.equal(nextCardPosition("ArrowRight", 2, 0, sizes), null);
  assert.equal(nextCardPosition("Enter", 0, 0, sizes), null);
});
