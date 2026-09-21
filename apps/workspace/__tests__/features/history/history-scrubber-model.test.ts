import assert from "node:assert/strict";
import test from "node:test";
import {
  clampZoom,
  followWindow,
  fractionToPosition,
  listIndexToPosition,
  maxZoom,
  positionToFraction,
  positionToListIndex,
  positionsPerPixel,
  SCRUBBER_MAX_STEP_PX,
  zoomWindow,
} from "../../../src/features/history/history-scrubber-model";

test("list indices and track positions mirror each other", () => {
  assert.equal(listIndexToPosition(0, 5), 4);
  assert.equal(listIndexToPosition(4, 5), 0);
  assert.equal(positionToListIndex(4, 5), 0);
  assert.equal(positionToListIndex(0.4, 5), 4);
  assert.equal(positionToListIndex(0.6, 5), 3);
});

test("positions past either end snap to the outermost revision", () => {
  assert.equal(positionToListIndex(-3, 5), 4);
  assert.equal(positionToListIndex(12, 5), 0);
});

test("zoom never drops below 1 or spreads a step past the max width", () => {
  assert.equal(clampZoom(0.2, 100, 400), 1);
  assert.equal(maxZoom(100, 396), (99 * SCRUBBER_MAX_STEP_PX) / 396);
  assert.equal(clampZoom(1000, 100, 396), maxZoom(100, 396));
  assert.equal(clampZoom(Number.NaN, 100, 396), 1);
  assert.equal(maxZoom(1, 400), 1);
  assert.equal(maxZoom(3, 400), 1);
});

test("an unzoomed window covers the whole track", () => {
  assert.deepEqual(followWindow(7, 11, 1, 3), { start: 0, size: 10 });
});

test("a zoomed window only moves once the position crosses its margins", () => {
  const view = followWindow(5, 101, 10, 0);
  assert.equal(view.size, 10);
  assert.equal(view.start, 0);

  const nudged = followWindow(9.5, 101, 10, 0);
  assert.ok(Math.abs(nudged.start - 0.7) < 1e-9);

  const back = followWindow(nudged.start + 0.5, 101, 10, nudged.start);
  assert.ok(back.start < nudged.start);
});

test("a zoomed window stays inside the track", () => {
  assert.equal(followWindow(100, 101, 10, 0).start, 90);
  assert.equal(followWindow(0, 101, 10, 50).start, 0);
});

test("zooming keeps the handle at the same on-screen fraction", () => {
  const before = { start: 0, size: 100 };
  const after = zoomWindow(25, 101, 4, before);
  assert.equal(after.size, 25);
  assert.equal(positionToFraction(25, after), positionToFraction(25, before));
  assert.deepEqual(zoomWindow(25, 101, 1, after), { start: 0, size: 100 });
  assert.equal(zoomWindow(100, 101, 4, before).start, 75);
});

test("fractions round-trip through the window", () => {
  const view = { start: 20, size: 10 };
  assert.equal(positionToFraction(25, view), 0.5);
  assert.equal(fractionToPosition(0.5, view), 25);
  assert.equal(positionsPerPixel(view, 200), 0.05);
  assert.equal(positionToFraction(3, { start: 0, size: 0 }), 1);
});
