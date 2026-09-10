import assert from "node:assert/strict";
import test from "node:test";
import { viewportMetrics } from "../../src/shell/viewport";

type FakeWindow = Parameters<typeof viewportMetrics>[0];

function windowWith(innerHeight: number, visual?: { height: number; offsetTop: number }): FakeWindow {
  return { innerHeight, visualViewport: visual } as unknown as FakeWindow;
}

test("viewportMetrics falls back to the layout viewport when visualViewport is missing", () => {
  assert.deepEqual(viewportMetrics(windowWith(800)), { height: 800, keyboardInset: 0 });
});

test("viewportMetrics reports the keyboard as the occluded remainder", () => {
  assert.deepEqual(viewportMetrics(windowWith(800, { height: 460, offsetTop: 0 })), {
    height: 460,
    keyboardInset: 340,
  });
});

test("viewportMetrics ignores a viewport scrolled past the layout height", () => {
  assert.deepEqual(viewportMetrics(windowWith(800, { height: 800, offsetTop: 120 })), {
    height: 800,
    keyboardInset: 0,
  });
});
