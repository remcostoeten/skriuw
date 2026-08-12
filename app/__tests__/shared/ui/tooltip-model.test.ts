import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTooltipPlacement,
  resolveOpenTiming,
} from "../../../src/shared/ui/tooltip-model";

const viewport = { width: 1000, height: 600 };

test("centers on the cross axis and offsets on the requested side", () => {
  const placement = computeTooltipPlacement({
    trigger: { top: 200, left: 10, width: 40, height: 40 },
    tooltip: { width: 80, height: 24 },
    side: "right",
    sideOffset: 6,
    collisionPadding: 8,
    viewport,
  });
  assert.deepEqual(placement, { side: "right", left: 56, top: 208 });
});

test("flips to the opposite side when the requested side overflows", () => {
  const placement = computeTooltipPlacement({
    trigger: { top: 4, left: 480, width: 40, height: 40 },
    tooltip: { width: 80, height: 24 },
    side: "top",
    sideOffset: 6,
    collisionPadding: 8,
    viewport,
  });
  assert.equal(placement.side, "bottom");
  assert.equal(placement.top, 50);
});

test("keeps the requested side when neither side fits", () => {
  const placement = computeTooltipPlacement({
    trigger: { top: 0, left: 0, width: 40, height: 600 },
    tooltip: { width: 80, height: 700 },
    side: "top",
    sideOffset: 6,
    collisionPadding: 8,
    viewport,
  });
  assert.equal(placement.side, "top");
});

test("clamps the cross axis inside the viewport with collision padding", () => {
  const placement = computeTooltipPlacement({
    trigger: { top: 570, left: 4, width: 20, height: 20 },
    tooltip: { width: 120, height: 24 },
    side: "right",
    sideOffset: 6,
    collisionPadding: 8,
    viewport,
  });
  assert.equal(placement.top, 600 - 24 - 8);
  assert.equal(placement.left, 30);
});

test("opens with the full delay and an animated state by default", () => {
  assert.deepEqual(resolveOpenTiming(10_000, 0, 350, 300), {
    waitMs: 350,
    state: "delayed-open",
  });
});

test("opens instantly within the skip-delay window after another tooltip closed", () => {
  assert.deepEqual(resolveOpenTiming(10_000, 9_800, 350, 300), {
    waitMs: 0,
    state: "instant-open",
  });
});

test("returns to the delayed state once the skip-delay window has passed", () => {
  assert.deepEqual(resolveOpenTiming(10_000, 9_600, 350, 300), {
    waitMs: 350,
    state: "delayed-open",
  });
});
