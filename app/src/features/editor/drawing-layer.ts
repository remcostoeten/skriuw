/**
 * The note's annotation layer: freehand ink and shapes drawn over the whole
 * note surface, in document coordinates.
 *
 * The model is deliberately library-independent — see ADR-0035. Geometry is
 * stored as plain numbers so the layer survives any change of renderer, and
 * every element carries a stable id so erasing, moving, and sync convergence
 * can address one element without rewriting the rest.
 */

export const DRAWING_LAYER_VERSION = 1;

/** Elements in one note. */
export const MAX_DRAWING_ELEMENTS = 512;
/** Points in one freehand stroke, after simplification. */
export const MAX_STROKE_POINTS = 2048;
/** Points across every stroke in one note. */
export const MAX_DRAWING_POINTS = 16384;
/** Coordinates are CSS pixels from the top-left of the note content. */
export const MAX_DRAWING_COORDINATE = 1_000_000;
export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 64;

export type DrawingTool = "pen" | "highlighter";
export type DrawingShapeKind = "line" | "rect" | "ellipse";

export type DrawingStroke = {
  id: string;
  kind: "stroke";
  tool: DrawingTool;
  /** A preset ink id or a `#rrggbb` literal — see {@link isDrawingColor}. */
  color: string;
  width: number;
  /** Flat `[x0, y0, x1, y1, …]` in document coordinates. */
  points: number[];
};

export type DrawingShape = {
  id: string;
  kind: DrawingShapeKind;
  color: string;
  width: number;
  /** Rectangles and ellipses only; a line is always a bare stroke. */
  filled: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type DrawingElement = DrawingStroke | DrawingShape;

export type DrawingLayer = {
  version: number;
  elements: DrawingElement[];
};

const SHAPE_KINDS: readonly string[] = ["line", "rect", "ellipse"];
const TOOLS: readonly string[] = ["pen", "highlighter"];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const PRESET_COLOR = /^[a-z][a-z0-9-]{0,23}$/;
const ELEMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Ink is stored as a preset id wherever possible so the same stroke can resolve
 * to a light or dark value at paint time; a custom color has no theme pair and
 * is stored as a literal.
 */
export function isDrawingColor(value: unknown): value is string {
  return typeof value === "string" && (HEX_COLOR.test(value) || PRESET_COLOR.test(value));
}

function isFiniteCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_DRAWING_COORDINATE
  );
}

function isWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_STROKE_WIDTH &&
    value <= MAX_STROKE_WIDTH
  );
}

function parseStroke(value: Record<string, unknown>): DrawingStroke | null {
  const { id, tool, color, width, points } = value;
  if (typeof id !== "string" || !ELEMENT_ID.test(id)) return null;
  if (typeof tool !== "string" || !TOOLS.includes(tool)) return null;
  if (!isDrawingColor(color) || !isWidth(width)) return null;
  if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0) return null;
  if (points.length > MAX_STROKE_POINTS * 2) return null;
  if (!points.every(isFiniteCoordinate)) return null;
  return {
    id,
    kind: "stroke",
    tool: tool as DrawingTool,
    color,
    width,
    points: [...(points as number[])],
  };
}

function parseShape(kind: DrawingShapeKind, value: Record<string, unknown>): DrawingShape | null {
  const { id, color, width, filled, x1, y1, x2, y2 } = value;
  if (typeof id !== "string" || !ELEMENT_ID.test(id)) return null;
  if (!isDrawingColor(color) || !isWidth(width)) return null;
  if (typeof filled !== "boolean") return null;
  if (![x1, y1, x2, y2].every(isFiniteCoordinate)) return null;
  return {
    id,
    kind,
    color,
    width,
    filled: kind !== "line" && filled,
    x1: x1 as number,
    y1: y1 as number,
    x2: x2 as number,
    y2: y2 as number,
  };
}

function parseElement(value: unknown): DrawingElement | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind === "stroke") return parseStroke(record);
  if (typeof kind === "string" && SHAPE_KINDS.includes(kind)) {
    return parseShape(kind as DrawingShapeKind, record);
  }
  return null;
}

/**
 * Reads a stored layer, or returns null when the payload is absent, malformed,
 * or written by a future version.
 *
 * Null means "this note has no layer this build can render" — never "discard
 * it". Callers that persist keep the raw payload untouched so a note edited by
 * an older build does not lose ink written by a newer one.
 */
export function parseDrawingLayer(value: unknown): DrawingLayer | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== DRAWING_LAYER_VERSION) return null;
  if (!Array.isArray(record.elements)) return null;
  if (record.elements.length > MAX_DRAWING_ELEMENTS) return null;
  const elements: DrawingElement[] = [];
  const seen = new Set<string>();
  for (const entry of record.elements) {
    const element = parseElement(entry);
    if (!element || seen.has(element.id)) return null;
    seen.add(element.id);
    elements.push(element);
  }
  if (countDrawingPoints(elements) > MAX_DRAWING_POINTS) return null;
  return { version: DRAWING_LAYER_VERSION, elements };
}

export function countDrawingPoints(elements: readonly DrawingElement[]): number {
  let total = 0;
  for (const element of elements) {
    if (element.kind === "stroke") total += element.points.length / 2;
  }
  return total;
}

export function isEmptyDrawingLayer(layer: DrawingLayer | null): boolean {
  return layer === null || layer.elements.length === 0;
}

export function emptyDrawingLayer(): DrawingLayer {
  return { version: DRAWING_LAYER_VERSION, elements: [] };
}

export type DrawingCapacity = {
  elements: number;
  points: number;
};

/** What one more element may still consume before the note hits its caps. */
export function drawingCapacity(layer: DrawingLayer | null): DrawingCapacity {
  const elements = layer?.elements ?? [];
  return {
    elements: Math.max(0, MAX_DRAWING_ELEMENTS - elements.length),
    points: Math.max(0, MAX_DRAWING_POINTS - countDrawingPoints(elements)),
  };
}

/**
 * Drops points that sit within `tolerance` of the line their neighbours
 * describe (Ramer–Douglas–Peucker), so a persisted stroke keeps its shape at a
 * fraction of the samples a pointer produces.
 */
export function simplifyStrokePoints(points: readonly number[], tolerance = 0.6): number[] {
  const count = Math.floor(points.length / 2);
  if (count < 3) return roundPoints(points);
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: Array<[number, number]> = [[0, count - 1]];
  const squaredTolerance = tolerance * tolerance;
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    if (last - first < 2) continue;
    let farthest = -1;
    let farthestDistance = squaredTolerance;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredSegmentDistance(points, index, first, last);
      if (distance > farthestDistance) {
        farthest = index;
        farthestDistance = distance;
      }
    }
    if (farthest === -1) continue;
    keep[farthest] = 1;
    stack.push([first, farthest], [farthest, last]);
  }
  const simplified: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!keep[index]) continue;
    simplified.push(points[index * 2] as number, points[index * 2 + 1] as number);
  }
  return roundPoints(simplified);
}

function squaredSegmentDistance(
  points: readonly number[],
  index: number,
  first: number,
  last: number,
): number {
  const x = points[index * 2] as number;
  const y = points[index * 2 + 1] as number;
  const startX = points[first * 2] as number;
  const startY = points[first * 2 + 1] as number;
  const endX = points[last * 2] as number;
  const endY = points[last * 2 + 1] as number;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  let projection = 0;
  if (lengthSquared > 0) {
    projection = ((x - startX) * deltaX + (y - startY) * deltaY) / lengthSquared;
    projection = Math.min(1, Math.max(0, projection));
  }
  const closestX = startX + projection * deltaX;
  const closestY = startY + projection * deltaY;
  const offsetX = x - closestX;
  const offsetY = y - closestY;
  return offsetX * offsetX + offsetY * offsetY;
}

/** Sub-tenth-of-a-pixel precision is invisible and only inflates the document. */
function roundPoints(points: readonly number[]): number[] {
  return points.map((value) => Math.round(value * 10) / 10);
}

export const DRAWING_FENCE_LANGUAGE = "drawing";

const FENCE_OPEN = "```" + DRAWING_FENCE_LANGUAGE;
const FENCE_CLOSE = "```";

/** The layer's Markdown projection: one fence, always last in the document. */
export function drawingFence(layer: DrawingLayer): string {
  return `${FENCE_OPEN}\n${JSON.stringify(layer)}\n${FENCE_CLOSE}`;
}

/**
 * Lifts a trailing `drawing` fence out of Markdown source and back into a
 * layer.
 *
 * A fence whose payload this build cannot read is left exactly where it is, so
 * it lands in the document as an ordinary code block rather than being dropped
 * — the same contract the `mermaid` fence keeps for unsupported diagrams.
 */
export function extractDrawingFence(markdown: string): {
  markdown: string;
  layer: DrawingLayer | null;
} {
  const lines = markdown.split("\n");
  for (let open = lines.length - 1; open >= 0; open -= 1) {
    if (lines[open]?.trimEnd() !== FENCE_OPEN) continue;
    let close = open + 1;
    while (close < lines.length && lines[close]?.trimEnd() !== FENCE_CLOSE) close += 1;
    if (close >= lines.length) continue;
    const layer = readLayerPayload(lines.slice(open + 1, close).join("\n"));
    if (!layer) continue;
    let start = open;
    while (start > 0 && lines[start - 1]?.trim() === "") start -= 1;
    return { markdown: lines.slice(0, start).concat(lines.slice(close + 1)).join("\n"), layer };
  }
  return { markdown, layer: null };
}

function readLayerPayload(payload: string): DrawingLayer | null {
  try {
    return parseDrawingLayer(JSON.parse(payload));
  } catch {
    return null;
  }
}
