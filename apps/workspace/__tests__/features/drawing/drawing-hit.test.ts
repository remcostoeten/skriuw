import assert from "node:assert/strict";
import test from "node:test";
import {
  elementsAlongStroke,
  elementsWithinBox,
  hitsElement,
  moveElement,
  selectionBounds,
  topmostHit,
} from "../../../src/features/drawing/drawing-hit";
import type { DrawingElement } from "../../../src/features/editor/drawing-layer";

function stroke(id: string, points: number[], width = 2): DrawingElement {
  return { id, kind: "stroke", tool: "pen", color: "ink", width, points };
}

function shape(
  id: string,
  kind: "line" | "rect" | "ellipse",
  box: [number, number, number, number],
  filled = false,
): DrawingElement {
  return {
    id,
    kind,
    color: "ink",
    width: 2,
    filled,
    x1: box[0],
    y1: box[1],
    x2: box[2],
    y2: box[3],
  };
}

test("a point on a stroke hits it and a point beside it does not", () => {
  const line = stroke("s1", [0, 0, 100, 0]);

  assert.equal(hitsElement(line, { x: 50, y: 0 }), true);
  assert.equal(hitsElement(line, { x: 50, y: 3 }), true, "within the tolerance band");
  assert.equal(hitsElement(line, { x: 50, y: 40 }), false);
  assert.equal(hitsElement(line, { x: 400, y: 0 }), false, "past the end");
});

test("a thick stroke is easier to hit than a thin one", () => {
  const thin = stroke("s1", [0, 0, 100, 0], 2);
  const thick = stroke("s2", [0, 0, 100, 0], 40);

  assert.equal(hitsElement(thin, { x: 50, y: 15 }), false);
  assert.equal(hitsElement(thick, { x: 50, y: 15 }), true);
});

test("a border-only rectangle is hit on its edge, not through its middle", () => {
  const box = shape("r1", "rect", [0, 0, 100, 60]);

  assert.equal(hitsElement(box, { x: 50, y: 0 }), true, "on the top edge");
  assert.equal(hitsElement(box, { x: 0, y: 30 }), true, "on the left edge");
  assert.equal(hitsElement(box, { x: 50, y: 30 }), false, "the hollow middle");
});

test("a filled rectangle is hit anywhere inside it", () => {
  const box = shape("r1", "rect", [0, 0, 100, 60], true);

  assert.equal(hitsElement(box, { x: 50, y: 30 }), true);
  assert.equal(hitsElement(box, { x: 150, y: 30 }), false);
});

test("an ellipse is hit on its curve and misses the corners of its box", () => {
  const oval = shape("e1", "ellipse", [0, 0, 100, 100]);

  assert.equal(hitsElement(oval, { x: 50, y: 0 }), true, "top of the curve");
  assert.equal(hitsElement(oval, { x: 0, y: 0 }), false, "the corner is outside the curve");
  assert.equal(hitsElement(oval, { x: 50, y: 50 }), false, "hollow centre");
  assert.equal(hitsElement(shape("e2", "ellipse", [0, 0, 100, 100], true), { x: 50, y: 50 }), true);
});

test("a click resolves to the element painted last", () => {
  const under = stroke("under", [0, 0, 100, 0]);
  const over = stroke("over", [0, 0, 100, 0]);

  assert.equal(topmostHit([under, over], { x: 50, y: 0 })?.id, "over");
  assert.equal(topmostHit([under, over], { x: 50, y: 90 }), null);
});

test("the eraser collects every element its drag passed over, once each", () => {
  const first = stroke("a", [0, 0, 10, 0]);
  const second = stroke("b", [40, 0, 50, 0]);
  const untouched = stroke("c", [0, 500, 10, 500]);

  const erased = elementsAlongStroke([first, second, untouched], [5, 0, 20, 0, 45, 0, 46, 0]);

  assert.deepEqual(erased.sort(), ["a", "b"]);
});

test("a rubber band selects only what it fully contains", () => {
  const inside = stroke("in", [20, 20, 40, 40]);
  const straddling = stroke("out", [80, 80, 400, 400]);

  const selected = elementsWithinBox([inside, straddling], { x: 0, y: 0 }, { x: 100, y: 100 });

  assert.deepEqual(selected, ["in"]);
});

test("a rubber band dragged up and to the left selects the same elements", () => {
  const inside = stroke("in", [20, 20, 40, 40]);

  assert.deepEqual(
    elementsWithinBox([inside], { x: 100, y: 100 }, { x: 0, y: 0 }),
    ["in"],
  );
});

test("moving an element shifts every coordinate and nothing else", () => {
  const moved = moveElement(stroke("s1", [0, 0, 10, 20]), 5, -5);

  assert.deepEqual(moved.kind === "stroke" ? moved.points : [], [5, -5, 15, 15]);
  assert.equal(moved.id, "s1");

  const box = moveElement(shape("r1", "rect", [0, 0, 10, 10]), 3, 4);
  assert.deepEqual(
    box.kind === "rect" ? [box.x1, box.y1, box.x2, box.y2] : [],
    [3, 4, 13, 14],
  );
});

test("a moved element still hits where it landed, not where it was", () => {
  const moved = moveElement(stroke("s1", [0, 0, 100, 0]), 0, 200);

  assert.equal(hitsElement(moved, { x: 50, y: 200 }), true);
  assert.equal(hitsElement(moved, { x: 50, y: 0 }), false);
});

test("selection bounds cover every selected element", () => {
  const bounds = selectionBounds([
    stroke("a", [0, 0, 10, 10]),
    stroke("b", [100, 200, 120, 220]),
  ]);

  assert.ok(bounds);
  assert.equal(bounds.minX, -1);
  assert.equal(bounds.maxX, 121);
  assert.equal(bounds.maxY, 221);
  assert.equal(selectionBounds([]), null);
});
