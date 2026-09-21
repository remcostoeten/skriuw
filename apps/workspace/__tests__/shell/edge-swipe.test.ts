import assert from "node:assert/strict";
import test from "node:test";
import {
  edgeSwipeOpens,
  sheetDragCloses,
  sheetDragOffset,
  swipeAxis,
  swipeEdgeAt,
} from "../../src/shell/edge-swipe";

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

test("edgeSwipeOpens maps edges to the panels the route has", () => {
  const left = { x: 4, y: 200, edge: "left" as const };
  const right = { x: 386, y: 200, edge: "right" as const };
  assert.equal(edgeSwipeOpens(left, 80, true, true), "sidebar");
  assert.equal(edgeSwipeOpens(left, 40, true, true), null);
  assert.equal(edgeSwipeOpens(left, 80, false, true), null);
  assert.equal(edgeSwipeOpens(right, 300, true, true), "metadata");
  assert.equal(edgeSwipeOpens(right, 300, true, false), null);
  assert.equal(edgeSwipeOpens({ ...left, edge: null }, 300, true, true), null);
});

test("a sheet only follows the finger toward its own edge", () => {
  assert.equal(sheetDragOffset("left", -30), -30);
  assert.equal(sheetDragOffset("left", 30), 0);
  assert.equal(sheetDragOffset("right", 30), 30);
  assert.equal(sheetDragOffset("right", -30), 0);
  assert.equal(sheetDragCloses("left", -80), true);
  assert.equal(sheetDragCloses("left", -20), false);
  assert.equal(sheetDragCloses("right", 80), true);
});
