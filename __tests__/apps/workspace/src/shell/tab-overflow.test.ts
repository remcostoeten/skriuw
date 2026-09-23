import assert from "node:assert/strict";
import { test } from "vitest";
import { MIN_TAB_WIDTH, splitTabsForWidth } from "@/shell/tab-overflow";

type Tab = { id: string; isActive: boolean; isPinned: boolean };

function tabs(count: number, activeIndex = 0, pinned: readonly number[] = []): Tab[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    isActive: index === activeIndex,
    isPinned: pinned.includes(index),
  }));
}

function ids(list: readonly Tab[]): string[] {
  return list.map((tab) => tab.id);
}

test("tabs that fit at a readable width all stay on the strip", () => {
  const result = splitTabsForWidth(tabs(4), MIN_TAB_WIDTH * 4);
  assert.deepEqual(ids(result.visible), ["n0", "n1", "n2", "n3"]);
  assert.deepEqual(result.overflow, []);
});

test("an unmeasured strip keeps every tab visible", () => {
  const result = splitTabsForWidth(tabs(20), 0);
  assert.equal(result.visible.length, 20);
  assert.deepEqual(result.overflow, []);
});

test("tabs beyond the readable capacity move to the overflow menu in order", () => {
  const result = splitTabsForWidth(tabs(10), MIN_TAB_WIDTH * 4);
  assert.deepEqual(ids(result.visible), ["n0", "n1", "n2"]);
  assert.deepEqual(ids(result.overflow), ["n3", "n4", "n5", "n6", "n7", "n8", "n9"]);
  assert.ok(result.visible.length * MIN_TAB_WIDTH <= MIN_TAB_WIDTH * 4);
});

test("the active tab stays on the strip instead of hiding behind the menu", () => {
  const result = splitTabsForWidth(tabs(10, 8), MIN_TAB_WIDTH * 4);
  assert.ok(ids(result.visible).includes("n8"));
  assert.ok(!ids(result.overflow).includes("n8"));
  assert.deepEqual(ids(result.visible), ["n0", "n1", "n8"]);
});

test("pinned tabs stay on the strip even when they exceed the capacity", () => {
  const result = splitTabsForWidth(tabs(10, 0, [5, 6, 7, 8]), MIN_TAB_WIDTH * 2);
  assert.deepEqual(ids(result.visible), ["n0", "n5", "n6", "n7", "n8"]);
  assert.deepEqual(ids(result.overflow), ["n1", "n2", "n3", "n4", "n9"]);
});

test("a narrow strip still shows one tab", () => {
  const result = splitTabsForWidth(tabs(6, 3), 40);
  assert.deepEqual(ids(result.visible), ["n3"]);
  assert.equal(result.overflow.length, 5);
});
