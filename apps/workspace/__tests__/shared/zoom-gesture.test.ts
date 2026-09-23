import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPan,
  DOUBLE_TAP_ZOOM,
  IDENTITY_ZOOM,
  isDoubleTap,
  MAX_ZOOM,
  swipeDismisses,
  toggleZoom,
  zoomAround,
} from "../../src/shared/ui/zoom-gesture";

const stage = { width: 390, height: 600 };
const content = { width: 390, height: 300 };

test("zoom stays within the allowed range", () => {
  assert.equal(zoomAround(IDENTITY_ZOOM, { x: 0, y: 0 }, 0.2).scale, 1);
  assert.equal(zoomAround(IDENTITY_ZOOM, { x: 0, y: 0 }, 99).scale, MAX_ZOOM);
});

test("zooming keeps the point under the finger fixed", () => {
  const focus = { x: 100, y: -50 };
  const next = zoomAround(IDENTITY_ZOOM, focus, 2);
  assert.equal(next.x, -100);
  assert.equal(next.y, 50);
});

test("double tap zooms in on the tapped point and back out", () => {
  const zoomed = toggleZoom(IDENTITY_ZOOM, { x: 10, y: 10 });
  assert.equal(zoomed.scale, DOUBLE_TAP_ZOOM);
  assert.deepEqual(toggleZoom(zoomed, { x: 0, y: 0 }), IDENTITY_ZOOM);
});

test("pan never exposes the stage past the image edge", () => {
  const clamped = clampPan({ scale: 2, x: 1000, y: 1000 }, stage, content);
  assert.equal(clamped.x, 195);
  assert.equal(clamped.y, 0);
  assert.deepEqual(clampPan({ scale: 1, x: 40, y: 40 }, stage, content), IDENTITY_ZOOM);
});

test("a second tap counts only when close in time and space", () => {
  const first = { time: 0, point: { x: 0, y: 0 } };
  assert.equal(isDoubleTap(null, 100, { x: 0, y: 0 }), false);
  assert.equal(isDoubleTap(first, 200, { x: 5, y: 5 }), true);
  assert.equal(isDoubleTap(first, 500, { x: 5, y: 5 }), false);
  assert.equal(isDoubleTap(first, 200, { x: 80, y: 0 }), false);
});

test("a long downward swipe dismisses only an unzoomed image", () => {
  assert.equal(swipeDismisses(1, 10, 120), true);
  assert.equal(swipeDismisses(1, 10, 40), false);
  assert.equal(swipeDismisses(1, 150, 120), false);
  assert.equal(swipeDismisses(2, 0, 200), false);
});
