export type SheetSide = "left" | "right";

export type SwipeStart = {
  x: number;
  y: number;
  edge: SheetSide | null;
};

export type SwipeAxis = "x" | "y" | null;

export const EDGE_ZONE_PX = 24;
export const AXIS_LOCK_PX = 10;
export const OPEN_DISTANCE_PX = 56;
export const CLOSE_DISTANCE_PX = 72;

/**
 * The compact shell's edge gesture, on the same numbers as
 * `app/src/shell/edge-swipe.ts`: a pull from the left edge opens the tree, a
 * pull from the right opens the account sheet, and a pull back toward either
 * edge closes the sheet anchored there.
 */
export function swipeEdgeAt(x: number, windowWidth: number): SheetSide | null {
  if (x <= EDGE_ZONE_PX) {
    return "left";
  }
  if (x >= windowWidth - EDGE_ZONE_PX) {
    return "right";
  }
  return null;
}

/**
 * Locks a gesture to an axis once the finger has moved far enough to mean it.
 * Until then the gesture is ambiguous, and a vertical lock hands the touch
 * back to scrolling untouched.
 */
export function swipeAxis(start: SwipeStart, x: number, y: number): SwipeAxis {
  const dx = Math.abs(x - start.x);
  const dy = Math.abs(y - start.y);
  if (dx < AXIS_LOCK_PX && dy < AXIS_LOCK_PX) {
    return null;
  }
  return dx > dy ? "x" : "y";
}

/** The sheet an edge pull asks to open, or null while it has not travelled far enough. */
export function edgeSwipeOpens(start: SwipeStart, x: number): SheetSide | null {
  const dx = x - start.x;
  if (start.edge === "left" && dx >= OPEN_DISTANCE_PX) {
    return "left";
  }
  if (start.edge === "right" && dx <= -OPEN_DISTANCE_PX) {
    return "right";
  }
  return null;
}

/**
 * How far a sheet anchored to `side` has been pushed toward its edge, clamped
 * so a pull away from the edge never drags it into the page.
 */
export function sheetDragOffset(side: SheetSide, dx: number): number {
  return side === "left" ? Math.min(0, dx) : Math.max(0, dx);
}

export function sheetDragCloses(side: SheetSide, dx: number): boolean {
  return Math.abs(sheetDragOffset(side, dx)) >= CLOSE_DISTANCE_PX;
}
