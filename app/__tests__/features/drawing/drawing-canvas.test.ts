import assert from "node:assert/strict";
import test from "node:test";
import {
  drawingElementBounds,
  paintDrawingLayer,
  paintMarquee,
  paintSelectionOutline,
  type DrawingContext,
  type DrawingViewport,
} from "../../../src/features/drawing/drawing-canvas";
import { HIGHLIGHTER_OPACITY } from "../../../src/features/drawing/drawing-brush";
import type { DrawingElement, DrawingLayer } from "../../../src/features/editor/drawing-layer";

type Call = { op: string; args: number[] };

function recordingContext() {
  const calls: Call[] = [];
  const alphas: number[] = [];
  const strokeStyles: string[] = [];
  const context: DrawingContext = {
    save: () => calls.push({ op: "save", args: [] }),
    restore: () => calls.push({ op: "restore", args: [] }),
    clearRect: (...args) => calls.push({ op: "clearRect", args }),
    beginPath: () => calls.push({ op: "beginPath", args: [] }),
    moveTo: (...args) => calls.push({ op: "moveTo", args }),
    lineTo: (...args) => calls.push({ op: "lineTo", args }),
    quadraticCurveTo: (...args) => calls.push({ op: "quadraticCurveTo", args }),
    rect: (...args) => calls.push({ op: "rect", args }),
    ellipse: (...args) => calls.push({ op: "ellipse", args }),
    stroke: () => {
      alphas.push(context.globalAlpha);
      strokeStyles.push(String(context.strokeStyle));
      calls.push({ op: "stroke", args: [] });
    },
    fill: () => {
      strokeStyles.push(String(context.fillStyle));
      calls.push({ op: "fill", args: [] });
    },
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
  };
  return { context, calls, alphas, strokeStyles };
}

const VIEWPORT: DrawingViewport = { width: 800, height: 600, scrollTop: 0, dark: true };

function layer(...elements: DrawingElement[]): DrawingLayer {
  return { version: 1, elements };
}

function stroke(points: number[], overrides: Partial<DrawingElement> = {}): DrawingElement {
  return {
    id: "s1",
    kind: "stroke",
    tool: "pen",
    color: "ink",
    width: 2,
    points,
    ...overrides,
  } as DrawingElement;
}

test("strokes paint in document coordinates offset by the note's scroll", () => {
  const { context, calls } = recordingContext();

  paintDrawingLayer(context, layer(stroke([10, 200, 20, 210])), { ...VIEWPORT, scrollTop: 150 });

  const moveTo = calls.find((call) => call.op === "moveTo");
  const lineTo = calls.find((call) => call.op === "lineTo");
  assert.deepEqual(moveTo?.args, [10, 50], "y shifts by scrollTop, x does not");
  assert.deepEqual(lineTo?.args, [20, 60]);
});

test("the same stroke lands elsewhere on screen once the note scrolls", () => {
  const first = recordingContext();
  const second = recordingContext();
  const ink = layer(stroke([10, 200, 20, 210]));

  paintDrawingLayer(first.context, ink, { ...VIEWPORT, scrollTop: 0 });
  paintDrawingLayer(second.context, ink, { ...VIEWPORT, scrollTop: 100 });

  const firstY = first.calls.find((call) => call.op === "moveTo")?.args[1];
  const secondY = second.calls.find((call) => call.op === "moveTo")?.args[1];
  assert.equal((firstY as number) - (secondY as number), 100);
});

test("every paint clears the surface first", () => {
  const { context, calls } = recordingContext();

  paintDrawingLayer(context, null, VIEWPORT);

  assert.equal(calls[0]?.op, "clearRect");
  assert.deepEqual(calls[0]?.args, [0, 0, 800, 600]);
  assert.equal(calls.length, 1, "an absent layer paints nothing else");
});

test("the highlighter is a translucent stroke, not its own engine", () => {
  const { context, alphas } = recordingContext();

  paintDrawingLayer(
    context,
    layer(
      stroke([0, 0, 10, 10], { id: "a", tool: "highlighter" }),
      stroke([0, 0, 10, 10], { id: "b", tool: "pen" }),
    ),
    VIEWPORT,
  );

  assert.deepEqual(alphas, [HIGHLIGHTER_OPACITY, 1]);
});

test("ink resolves against the theme at paint time", () => {
  const dark = recordingContext();
  const light = recordingContext();
  const ink = layer(stroke([0, 0, 1, 1], { color: "red" }));

  paintDrawingLayer(dark.context, ink, { ...VIEWPORT, dark: true });
  paintDrawingLayer(light.context, ink, { ...VIEWPORT, dark: false });

  assert.equal(dark.strokeStyles[0], "#ff8787");
  assert.equal(light.strokeStyles[0], "#e03131");
});

test("a filled shape fills and a border-only shape strokes", () => {
  const filled = recordingContext();
  const outlined = recordingContext();
  const box = {
    id: "r1",
    kind: "rect" as const,
    color: "ink",
    width: 2,
    x1: 0,
    y1: 0,
    x2: 40,
    y2: 20,
  };

  paintDrawingLayer(filled.context, layer({ ...box, filled: true }), VIEWPORT);
  paintDrawingLayer(outlined.context, layer({ ...box, filled: false }), VIEWPORT);

  assert.ok(filled.calls.some((call) => call.op === "fill"));
  assert.ok(!filled.calls.some((call) => call.op === "stroke"));
  assert.ok(outlined.calls.some((call) => call.op === "stroke"));
  assert.ok(!outlined.calls.some((call) => call.op === "fill"));
});

test("a line ignores fill and always strokes", () => {
  const { context, calls } = recordingContext();

  paintDrawingLayer(
    context,
    layer({
      id: "l1",
      kind: "line",
      color: "ink",
      width: 2,
      filled: true,
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
    }),
    VIEWPORT,
  );

  assert.ok(calls.some((call) => call.op === "stroke"));
  assert.ok(!calls.some((call) => call.op === "fill"));
});

test("ink far outside the viewport is skipped instead of traced", () => {
  const { context, calls } = recordingContext();

  paintDrawingLayer(context, layer(stroke([0, 90_000, 10, 90_010])), VIEWPORT);

  assert.equal(calls.length, 1, "only the clear should run");
});

test("a single-point stroke still leaves a mark", () => {
  const { context, calls } = recordingContext();

  paintDrawingLayer(context, layer(stroke([5, 5])), VIEWPORT);

  assert.deepEqual(calls.find((call) => call.op === "moveTo")?.args, [5, 5]);
  assert.deepEqual(calls.find((call) => call.op === "lineTo")?.args, [5, 5]);
});

test("bounds grow by half the stroke width so thick ink stays hittable", () => {
  const bounds = drawingElementBounds(stroke([10, 10, 30, 40], { width: 8 }));

  assert.deepEqual(bounds, { minX: 6, minY: 6, maxX: 34, maxY: 44 });
});

test("shape bounds normalise a rectangle dragged upward and to the left", () => {
  const bounds = drawingElementBounds({
    id: "r1",
    kind: "rect",
    color: "ink",
    width: 2,
    filled: false,
    x1: 50,
    y1: 60,
    x2: 10,
    y2: 20,
  });

  assert.deepEqual(bounds, { minX: 9, minY: 19, maxX: 51, maxY: 61 });
});

test("ink the eraser is about to remove is dimmed, not hidden", () => {
  const { context, alphas } = recordingContext();
  const ink = layer(
    stroke([0, 0, 10, 10], { id: "doomed" }),
    stroke([0, 0, 10, 10], { id: "safe" }),
  );

  paintDrawingLayer(context, ink, VIEWPORT, { dimmed: new Set(["doomed"]) });

  assert.equal(alphas.length, 2);
  assert.ok((alphas[0] as number) > 0, "a dimmed element still paints");
  assert.ok((alphas[0] as number) < (alphas[1] as number));
});

test("the highlighter keeps its own translucency when dimmed", () => {
  const plain = recordingContext();
  const dimmed = recordingContext();
  const ink = layer(stroke([0, 0, 10, 10], { id: "h", tool: "highlighter" }));

  paintDrawingLayer(plain.context, ink, VIEWPORT);
  paintDrawingLayer(dimmed.context, ink, VIEWPORT, { dimmed: new Set(["h"]) });

  assert.equal(plain.alphas[0], HIGHLIGHTER_OPACITY);
  assert.ok((dimmed.alphas[0] as number) < HIGHLIGHTER_OPACITY);
});

test("the selection outline follows the scroll and takes the accent it is given", () => {
  const { context, calls, strokeStyles } = recordingContext();

  paintSelectionOutline(
    context,
    { minX: 10, minY: 210, maxX: 60, maxY: 260 },
    { ...VIEWPORT, scrollTop: 200 },
    "hsl(220 90% 65%)",
  );

  const rect = calls.find((call) => call.op === "rect");
  assert.ok(rect);
  assert.equal(rect.args[1], 7, "y is offset by scrollTop, minus the outline padding");
  assert.equal(strokeStyles[0], "hsl(220 90% 65%)");
});

test("the rubber band paints a filled body under its border", () => {
  const { context, calls } = recordingContext();

  paintMarquee(context, { x: 0, y: 0 }, { x: 40, y: 20 }, VIEWPORT, "hsl(220 90% 65%)");

  const order = calls.map((call) => call.op);
  assert.ok(order.indexOf("fill") < order.indexOf("stroke"), "border draws over the body");
  assert.deepEqual(calls.find((call) => call.op === "rect")?.args, [0, 0, 40, 20]);
});
