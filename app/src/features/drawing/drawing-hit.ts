import type { DrawingElement } from "@/features/editor/drawing-layer";
import { drawingElementBounds, type DrawingBounds } from "./drawing-canvas";
import type { GesturePoint } from "./drawing-geometry";

/** How far outside its own width an element still counts as hit. */
export const HIT_TOLERANCE = 4;

/**
 * Whether a point lands on an element.
 *
 * Erasing and selecting work on whole elements, so this is geometry against
 * the stored shape rather than a read of painted pixels: a canvas that has
 * scrolled, been re-themed, or not yet painted still answers the same way.
 */
export function hitsElement(
  element: DrawingElement,
  point: GesturePoint,
  tolerance = HIT_TOLERANCE,
): boolean {
  const reach = element.width / 2 + tolerance;
  if (!withinBounds(drawingElementBounds(element), point, tolerance)) return false;
  if (element.kind === "stroke") {
    return strokeDistance(element.points, point) <= reach;
  }
  if (element.kind === "line") {
    return (
      segmentDistance(point, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }) <=
      reach
    );
  }
  const box = normalisedBox(element.x1, element.y1, element.x2, element.y2);
  if (element.filled) {
    return element.kind === "rect" ? insideRect(box, point) : insideEllipse(box, point);
  }
  return element.kind === "rect"
    ? nearRectBorder(box, point, reach)
    : nearEllipseBorder(box, point, reach);
}

/** The element a click acts on: the last one painted that the point lands on. */
export function topmostHit(
  elements: readonly DrawingElement[],
  point: GesturePoint,
  tolerance = HIT_TOLERANCE,
): DrawingElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element && hitsElement(element, point, tolerance)) return element;
  }
  return null;
}

/** Ids of every element a rubber-band selection fully contains. */
export function elementsWithinBox(
  elements: readonly DrawingElement[],
  from: GesturePoint,
  to: GesturePoint,
): string[] {
  const box = normalisedBox(from.x, from.y, to.x, to.y);
  return elements
    .filter((element) => {
      const bounds = drawingElementBounds(element);
      return (
        bounds.minX >= box.left &&
        bounds.maxX <= box.right &&
        bounds.minY >= box.top &&
        bounds.maxY <= box.bottom
      );
    })
    .map((element) => element.id);
}

/** Ids of every element a drag of the eraser passed over. */
export function elementsAlongStroke(
  elements: readonly DrawingElement[],
  points: readonly number[],
  tolerance = HIT_TOLERANCE,
): string[] {
  const hit = new Set<string>();
  for (let index = 0; index < points.length; index += 2) {
    const point = { x: points[index] as number, y: points[index + 1] as number };
    for (const element of elements) {
      if (hit.has(element.id)) continue;
      if (hitsElement(element, point, tolerance)) hit.add(element.id);
    }
  }
  return [...hit];
}

export function moveElement(
  element: DrawingElement,
  deltaX: number,
  deltaY: number,
): DrawingElement {
  if (element.kind === "stroke") {
    const points = element.points.map((value, index) =>
      index % 2 === 0 ? value + deltaX : value + deltaY,
    );
    return { ...element, points };
  }
  return {
    ...element,
    x1: element.x1 + deltaX,
    y1: element.y1 + deltaY,
    x2: element.x2 + deltaX,
    y2: element.y2 + deltaY,
  };
}

export type NormalisedBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function normalisedBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): NormalisedBox {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

/** The union of several elements' bounds, for painting one selection outline. */
export function selectionBounds(
  elements: readonly DrawingElement[],
): DrawingBounds | null {
  if (elements.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const element of elements) {
    const bounds = drawingElementBounds(element);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  return { minX, minY, maxX, maxY };
}

function withinBounds(bounds: DrawingBounds, point: GesturePoint, tolerance: number): boolean {
  return (
    point.x >= bounds.minX - tolerance &&
    point.x <= bounds.maxX + tolerance &&
    point.y >= bounds.minY - tolerance &&
    point.y <= bounds.maxY + tolerance
  );
}

function strokeDistance(points: readonly number[], point: GesturePoint): number {
  const count = points.length / 2;
  if (count === 1) {
    return Math.hypot(point.x - (points[0] as number), point.y - (points[1] as number));
  }
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count - 1; index += 1) {
    const start = { x: points[index * 2] as number, y: points[index * 2 + 1] as number };
    const end = { x: points[index * 2 + 2] as number, y: points[index * 2 + 3] as number };
    closest = Math.min(closest, segmentDistance(point, start, end));
    if (closest === 0) break;
  }
  return closest;
}

function segmentDistance(
  point: GesturePoint,
  start: GesturePoint,
  end: GesturePoint,
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  let projection = 0;
  if (lengthSquared > 0) {
    projection = ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared;
    projection = Math.min(1, Math.max(0, projection));
  }
  return Math.hypot(
    point.x - (start.x + projection * deltaX),
    point.y - (start.y + projection * deltaY),
  );
}

function insideRect(box: NormalisedBox, point: GesturePoint): boolean {
  return (
    point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
  );
}

function nearRectBorder(
  box: NormalisedBox,
  point: GesturePoint,
  reach: number,
): boolean {
  if (!insideRect(
    { left: box.left - reach, top: box.top - reach, right: box.right + reach, bottom: box.bottom + reach },
    point,
  )) {
    return false;
  }
  const inset = {
    left: box.left + reach,
    top: box.top + reach,
    right: box.right - reach,
    bottom: box.bottom - reach,
  };
  return !(inset.left < inset.right && inset.top < inset.bottom && insideRect(inset, point));
}

/** Normalised radial distance: 1 is exactly on the ellipse. */
function ellipseRadius(box: NormalisedBox, point: GesturePoint): number {
  const radiusX = (box.right - box.left) / 2;
  const radiusY = (box.bottom - box.top) / 2;
  if (radiusX === 0 || radiusY === 0) return Number.POSITIVE_INFINITY;
  const offsetX = (point.x - (box.left + radiusX)) / radiusX;
  const offsetY = (point.y - (box.top + radiusY)) / radiusY;
  return Math.hypot(offsetX, offsetY);
}

function insideEllipse(box: NormalisedBox, point: GesturePoint): boolean {
  return ellipseRadius(box, point) <= 1;
}

function nearEllipseBorder(
  box: NormalisedBox,
  point: GesturePoint,
  reach: number,
): boolean {
  const radiusX = (box.right - box.left) / 2;
  const radiusY = (box.bottom - box.top) / 2;
  const smallest = Math.min(radiusX, radiusY);
  if (smallest === 0) return false;
  const band = reach / smallest;
  const radius = ellipseRadius(box, point);
  return radius >= 1 - band && radius <= 1 + band;
}
