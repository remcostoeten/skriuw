import assert from "node:assert/strict";
import { test } from "vitest";
import { daySwipeStep } from "@/features/journal/day-swipe";

test("daySwipeStep steps a day only for a decisive horizontal drag", () => {
  const start = { x: 200, y: 100, edge: null };
  assert.equal(daySwipeStep(start, 290, 110), -1);
  assert.equal(daySwipeStep(start, 110, 95), 1);
  assert.equal(daySwipeStep(start, 240, 104), 0);
  assert.equal(daySwipeStep(start, 270, 260), 0);
  assert.equal(daySwipeStep(start, 203, 102), 0);
});
