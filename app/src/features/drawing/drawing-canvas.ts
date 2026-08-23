import {
  type DrawingElement,
  type DrawingLayer,
  type DrawingShape,
  type DrawingStroke,
} from "@/features/editor/drawing-layer";
import { HIGHLIGHTER_OPACITY, resolveInk } from "./drawing-brush";

/**
 * The painter's view of the note. Strokes live in document coordinates, so the
 * canvas stays viewport-sized and shifts its origin by the note's scroll
 * position rather than growing as tall as the document — see ADR-0035.
 */
export type DrawingViewport = {
  width: number;
  height: number;
  scrollTop: number;
  dark: boolean;
};

/** The 2D context surface this module needs, so tests can stand one in. */
export type DrawingContext = {
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void;
  stroke(): void;
  fill(): void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
};

/** Elements whose bounds fall outside this margin of the viewport are skipped. */
const CULL_MARGIN = 64;

export function paintDrawingLayer(
  context: DrawingContext,
  layer: DrawingLayer | null,
  viewport: DrawingViewport,
): void {
  context.clearRect(0, 0, viewport.width, viewport.height);
  if (!layer) return;
  for (const element of layer.elements) {
    paintDrawingElement(context, element, viewport);
  }
}

export function paintDrawingElement(
  context: DrawingContext,
  element: DrawingElement,
  viewport: DrawingViewport,
): void {
  if (!intersectsViewport(element, viewport)) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  const ink = resolveInk(element.color, viewport.dark);
  context.strokeStyle = ink;
  context.fillStyle = ink;
  context.lineWidth = element.width;
  if (element.kind === "stroke") {
    context.globalAlpha = element.tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1;
    traceStroke(context, element, viewport.scrollTop);
    context.stroke();
  } else {
    context.globalAlpha = 1;
    traceShape(context, element, viewport.scrollTop);
    if (element.kind !== "line" && element.filled) {
      context.fill();
    } else {
      context.stroke();
    }
  }
  context.restore();
}

/**
 * Draws the stroke as a quadratic spline through the midpoints of consecutive
 * samples, which rounds off the polyline a pointer produces without needing a
 * smoothing dependency.
 */
function traceStroke(context: DrawingContext, stroke: DrawingStroke, scrollTop: number): void {
  const { points } = stroke;
  context.beginPath();
  const count = points.length / 2;
  const x = (index: number) => points[index * 2] as number;
  const y = (index: number) => (points[index * 2 + 1] as number) - scrollTop;
  if (count === 1) {
    // A tap still leaves a mark: a zero-length line with a round cap is a dot.
    context.moveTo(x(0), y(0));
    context.lineTo(x(0), y(0));
    return;
  }
  context.moveTo(x(0), y(0));
  if (count === 2) {
    context.lineTo(x(1), y(1));
    return;
  }
  for (let index = 1; index < count - 1; index += 1) {
    context.quadraticCurveTo(
      x(index),
      y(index),
      (x(index) + x(index + 1)) / 2,
      (y(index) + y(index + 1)) / 2,
    );
  }
  context.quadraticCurveTo(x(count - 2), y(count - 2), x(count - 1), y(count - 1));
}

function traceShape(context: DrawingContext, shape: DrawingShape, scrollTop: number): void {
  const y1 = shape.y1 - scrollTop;
  const y2 = shape.y2 - scrollTop;
  context.beginPath();
  if (shape.kind === "line") {
    context.moveTo(shape.x1, y1);
    context.lineTo(shape.x2, y2);
    return;
  }
  const left = Math.min(shape.x1, shape.x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(shape.x2 - shape.x1);
  const height = Math.abs(y2 - y1);
  if (shape.kind === "rect") {
    context.rect(left, top, width, height);
    return;
  }
  context.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
}

export type DrawingBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Document-coordinate bounds, already grown by the element's own stroke width. */
export function drawingElementBounds(element: DrawingElement): DrawingBounds {
  const padding = element.width / 2;
  if (element.kind !== "stroke") {
    return {
      minX: Math.min(element.x1, element.x2) - padding,
      minY: Math.min(element.y1, element.y2) - padding,
      maxX: Math.max(element.x1, element.x2) + padding,
      maxY: Math.max(element.y1, element.y2) + padding,
    };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < element.points.length; index += 2) {
    const x = element.points[index] as number;
    const y = element.points[index + 1] as number;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

function intersectsViewport(element: DrawingElement, viewport: DrawingViewport): boolean {
  const bounds = drawingElementBounds(element);
  const top = viewport.scrollTop - CULL_MARGIN;
  const bottom = viewport.scrollTop + viewport.height + CULL_MARGIN;
  return bounds.maxY >= top && bounds.minY <= bottom;
}
