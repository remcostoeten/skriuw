import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_SHAPE_SIZE,
  PLACEMENT_STEP,
  PLACEMENT_STEP_LARGE,
  STAMPED_SHAPE_SIZE,
  constrainBox,
  constrainGesture,
  constrainLine,
  isDegenerateGesture,
  movePlacement,
  stampedGesture,
} from "../../../src/features/drawing/drawing-geometry";

const ORIGIN = { x: 100, y: 100 };

function round(point: { x: number; y: number }) {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

test("a nearly horizontal line snaps flat without changing length", () => {
  const snapped = constrainLine(ORIGIN, { x: 200, y: 108 });

  assert.equal(round(snapped).y, 100);
  assert.ok(Math.abs(round(snapped).x - 200) <= 1, "length is preserved, not the x delta");
});

test("a line near the diagonal snaps to 45 degrees", () => {
  const snapped = round(constrainLine(ORIGIN, { x: 180, y: 172 }));

  assert.equal(snapped.x - 100, snapped.y - 100);
});

test("a line snaps in the direction it was dragged", () => {
  assert.equal(round(constrainLine(ORIGIN, { x: 20, y: 96 })).x < 100, true, "leftward stays left");
  assert.equal(round(constrainLine(ORIGIN, { x: 104, y: 10 })).y < 100, true, "upward stays up");
});

test("a zero-length line is left alone rather than snapped to an arbitrary angle", () => {
  assert.deepEqual(constrainLine(ORIGIN, { ...ORIGIN }), ORIGIN);
});

test("a constrained box squares off the longer axis", () => {
  assert.deepEqual(constrainBox(ORIGIN, { x: 180, y: 130 }), { x: 180, y: 180 });
  assert.deepEqual(constrainBox(ORIGIN, { x: 130, y: 180 }), { x: 180, y: 180 });
});

test("a constrained box keeps the direction of the drag", () => {
  assert.deepEqual(constrainBox(ORIGIN, { x: 20, y: 70 }), { x: 20, y: 20 });
  assert.deepEqual(constrainBox(ORIGIN, { x: 160, y: 40 }), { x: 160, y: 40 });
});

test("constrainGesture routes lines and boxes to their own rule", () => {
  assert.deepEqual(
    constrainGesture("rect", ORIGIN, { x: 180, y: 130 }),
    constrainBox(ORIGIN, { x: 180, y: 130 }),
  );
  assert.deepEqual(
    constrainGesture("ellipse", ORIGIN, { x: 180, y: 130 }),
    constrainBox(ORIGIN, { x: 180, y: 130 }),
  );
  assert.deepEqual(
    constrainGesture("line", ORIGIN, { x: 180, y: 130 }),
    constrainLine(ORIGIN, { x: 180, y: 130 }),
  );
});

test("a click that never became a drag is not a shape", () => {
  assert.equal(isDegenerateGesture(ORIGIN, { x: 100.5, y: 100.5 }), true);
  assert.equal(isDegenerateGesture(ORIGIN, { x: 100 + MIN_SHAPE_SIZE, y: 100 }), false);
});

test("a stamped shape is centred on the placement cursor", () => {
  const { from, to } = stampedGesture(ORIGIN);

  assert.equal(to.x - from.x, STAMPED_SHAPE_SIZE);
  assert.equal(to.y - from.y, STAMPED_SHAPE_SIZE);
  assert.equal((from.x + to.x) / 2, ORIGIN.x);
  assert.equal((from.y + to.y) / 2, ORIGIN.y);
});

test("arrows move the placement cursor and shift moves it further", () => {
  assert.deepEqual(movePlacement(ORIGIN, "ArrowRight", false), {
    x: 100 + PLACEMENT_STEP,
    y: 100,
  });
  assert.deepEqual(movePlacement(ORIGIN, "ArrowUp", true), {
    x: 100,
    y: 100 - PLACEMENT_STEP_LARGE,
  });
  assert.equal(movePlacement(ORIGIN, "Enter", false), null);
});
