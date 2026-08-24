import type { DrawingShapeKind } from "@/features/editor/drawing-layer";

export type GesturePoint = {
  x: number;
  y: number;
};

const SNAP_RADIANS = Math.PI / 4;

/**
 * Snaps a line's far end to the nearest 0, 45, or 90 degrees while keeping the
 * length the reader dragged, so a constrained line does not also jump in size.
 */
export function constrainLine(from: GesturePoint, to: GesturePoint): GesturePoint {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length === 0) return { ...to };
  const angle = Math.round(Math.atan2(deltaY, deltaX) / SNAP_RADIANS) * SNAP_RADIANS;
  return {
    x: from.x + Math.cos(angle) * length,
    y: from.y + Math.sin(angle) * length,
  };
}

/**
 * Squares a drag box off the longer axis, keeping the direction the reader
 * dragged in so the shape still grows toward the pointer.
 */
export function constrainBox(from: GesturePoint, to: GesturePoint): GesturePoint {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  return {
    x: from.x + (deltaX < 0 ? -size : size),
    y: from.y + (deltaY < 0 ? -size : size),
  };
}

export function constrainGesture(
  kind: DrawingShapeKind,
  from: GesturePoint,
  to: GesturePoint,
): GesturePoint {
  return kind === "line" ? constrainLine(from, to) : constrainBox(from, to);
}

/** The smallest drag that counts as a shape rather than a stray click. */
export const MIN_SHAPE_SIZE = 2;

export function isDegenerateGesture(from: GesturePoint, to: GesturePoint): boolean {
  return Math.abs(to.x - from.x) < MIN_SHAPE_SIZE && Math.abs(to.y - from.y) < MIN_SHAPE_SIZE;
}

/** The size a keyboard-stamped shape gets, since there is no drag to measure. */
export const STAMPED_SHAPE_SIZE = 96;

export function stampedGesture(at: GesturePoint): { from: GesturePoint; to: GesturePoint } {
  return {
    from: { x: at.x - STAMPED_SHAPE_SIZE / 2, y: at.y - STAMPED_SHAPE_SIZE / 2 },
    to: { x: at.x + STAMPED_SHAPE_SIZE / 2, y: at.y + STAMPED_SHAPE_SIZE / 2 },
  };
}

/** Arrow-key movement for the keyboard placement cursor. */
export const PLACEMENT_STEP = 8;
export const PLACEMENT_STEP_LARGE = 40;

export function movePlacement(
  at: GesturePoint,
  key: string,
  large: boolean,
): GesturePoint | null {
  const step = large ? PLACEMENT_STEP_LARGE : PLACEMENT_STEP;
  if (key === "ArrowLeft") return { x: at.x - step, y: at.y };
  if (key === "ArrowRight") return { x: at.x + step, y: at.y };
  if (key === "ArrowUp") return { x: at.x, y: at.y - step };
  if (key === "ArrowDown") return { x: at.x, y: at.y + step };
  return null;
}
