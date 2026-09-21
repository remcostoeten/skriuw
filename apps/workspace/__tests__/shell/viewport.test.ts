import assert from "node:assert/strict";
import test from "node:test";
import { keyboardOpen, viewportMetrics } from "../../src/shell/viewport";

type FakeWindow = Parameters<typeof viewportMetrics>[0];

function windowWith(innerHeight: number, visual?: { height: number; offsetTop: number }): FakeWindow {
  return { innerHeight, visualViewport: visual } as unknown as FakeWindow;
}

test("viewportMetrics falls back to the layout viewport when visualViewport is missing", () => {
  assert.deepEqual(viewportMetrics(windowWith(800)), { height: 800, top: 0, keyboardInset: 0 });
});

test("viewportMetrics reports the keyboard as the occluded remainder", () => {
  const metrics = viewportMetrics(windowWith(800, { height: 460, offsetTop: 0 }));
  assert.deepEqual(metrics, { height: 460, top: 0, keyboardInset: 340 });
  assert.equal(keyboardOpen(metrics), true);
});

test("viewportMetrics ignores a viewport scrolled past the layout height", () => {
  const metrics = viewportMetrics(windowWith(800, { height: 680, offsetTop: 120 }));
  assert.deepEqual(metrics, { height: 680, top: 120, keyboardInset: 0 });
  assert.equal(keyboardOpen(metrics), false);
});
