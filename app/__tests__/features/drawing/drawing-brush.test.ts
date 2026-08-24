import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BRUSH,
  accentFromTriplet,
  DRAWING_INKS,
  HIGHLIGHTER_WIDTH_STOPS,
  PEN_WIDTH_STOPS,
  brushWidth,
  clampStrokeWidth,
  isDarkBackground,
  isInkingTool,
  isShapeTool,
  resolveInk,
  stepBrushWidth,
  withBrushWidth,
} from "../../../src/features/drawing/drawing-brush";
import {
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  isDrawingColor,
} from "../../../src/features/editor/drawing-layer";

test("every preset ink is a storable color with a distinct digit", () => {
  const digits = new Set(DRAWING_INKS.map((ink) => ink.key));
  assert.equal(digits.size, DRAWING_INKS.length);
  for (const ink of DRAWING_INKS) {
    assert.ok(isDrawingColor(ink.id), `${ink.id} must survive the layer validator`);
    assert.ok(isDrawingColor(ink.light));
    assert.ok(isDrawingColor(ink.dark));
  }
});

test("a preset resolves per theme and a custom color is used as written", () => {
  assert.equal(resolveInk("red", true), "#ff8787");
  assert.equal(resolveInk("red", false), "#e03131");
  assert.equal(resolveInk("#123456", true), "#123456");
  assert.equal(resolveInk("#123456", false), "#123456");
});

test("width is clamped to what the layer will accept", () => {
  assert.equal(clampStrokeWidth(0), MIN_STROKE_WIDTH);
  assert.equal(clampStrokeWidth(1000), MAX_STROKE_WIDTH);
  assert.equal(clampStrokeWidth(Number.NaN), DEFAULT_BRUSH.penWidth);
  assert.equal(clampStrokeWidth(3.14159), 3.1);
});

test("width belongs to the tool, so switching tools keeps each one usable", () => {
  const pen = { ...DEFAULT_BRUSH, tool: "pen" as const };
  const thickPen = withBrushWidth(pen, 12);
  assert.equal(thickPen.penWidth, 12);
  assert.equal(thickPen.highlighterWidth, DEFAULT_BRUSH.highlighterWidth);

  const highlighter = { ...thickPen, tool: "highlighter" as const };
  assert.equal(brushWidth(highlighter), DEFAULT_BRUSH.highlighterWidth);
  assert.equal(withBrushWidth(highlighter, 40).penWidth, 12);
});

test("stepping moves to the next stop past a width the wheel chose", () => {
  const pen = withBrushWidth({ ...DEFAULT_BRUSH, tool: "pen" }, 5);

  assert.equal(brushWidth(stepBrushWidth(pen, 1)), 8);
  assert.equal(brushWidth(stepBrushWidth(pen, -1)), 4);
});

test("stepping stops at the ends instead of wrapping", () => {
  const thinnest = withBrushWidth({ ...DEFAULT_BRUSH, tool: "pen" }, PEN_WIDTH_STOPS[0] as number);
  assert.equal(brushWidth(stepBrushWidth(thinnest, -1)), PEN_WIDTH_STOPS[0]);

  const widest = withBrushWidth(
    { ...DEFAULT_BRUSH, tool: "highlighter" },
    HIGHLIGHTER_WIDTH_STOPS[HIGHLIGHTER_WIDTH_STOPS.length - 1] as number,
  );
  assert.equal(
    brushWidth(stepBrushWidth(widest, 1)),
    HIGHLIGHTER_WIDTH_STOPS[HIGHLIGHTER_WIDTH_STOPS.length - 1],
  );
});

test("the eraser and the selector are not inking tools", () => {
  assert.equal(isInkingTool("pen"), true);
  assert.equal(isInkingTool("rect"), true);
  assert.equal(isInkingTool("eraser"), false);
  assert.equal(isInkingTool("select"), false);
  assert.equal(isShapeTool("rect"), true);
  assert.equal(isShapeTool("pen"), false);
});

test("theme darkness comes from the resolved background lightness", () => {
  assert.equal(isDarkBackground("2 0% 7%"), true, "midnight");
  assert.equal(isDarkBackground("40 16% 95%"), false, "paper");
  assert.equal(isDarkBackground("  20 15% 9%  "), true);
  assert.equal(isDarkBackground(""), true, "an unreadable value must not wash ink out");
});

test("selection chrome resolves its accent from a theme token", () => {
  assert.equal(accentFromTriplet("217 91% 60%", "#fff"), "hsl(217 91% 60%)");
  assert.equal(accentFromTriplet("  217 91% 60%  ", "#fff"), "hsl(217 91% 60%)");
  assert.equal(accentFromTriplet("", "#fff"), "#fff", "an unreadable token falls back");
  assert.equal(accentFromTriplet("217 91%", "#fff"), "#fff");
});
