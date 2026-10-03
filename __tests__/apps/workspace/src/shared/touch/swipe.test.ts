import assert from "node:assert/strict";
import { test } from "vitest";
import { swipeAxis, swipeEdgeAt } from "@/shared/touch/swipe";

test("swipeEdgeAt recognises both screen edges", () => {
  assert.equal(swipeEdgeAt(4, 390), "left");
  assert.equal(swipeEdgeAt(380, 390), "right");
  assert.equal(swipeEdgeAt(200, 390), null);
});

test("swipeAxis stays undecided until the finger commits", () => {
  const start = { x: 100, y: 100, edge: null };
  assert.equal(swipeAxis(start, 104, 103), null);
  assert.equal(swipeAxis(start, 130, 104), "x");
  assert.equal(swipeAxis(start, 103, 140), "y");
});
