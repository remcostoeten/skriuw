export type SwipeEdge = "left" | "right";

export type SwipeStart = {
  x: number;
  y: number;
  edge: SwipeEdge | null;
};

export type SwipeAxis = "x" | "y" | null;

export const EDGE_ZONE_PX = 24;
export const AXIS_LOCK_PX = 10;
export const OPEN_DISTANCE_PX = 56;
export const CLOSE_DISTANCE_PX = 72;

/** Which screen edge a touch started on, if any. */
export function swipeEdgeAt(x: number, viewportWidth: number): SwipeEdge | null {
  if (x <= EDGE_ZONE_PX) {
    return "left";
  }
  if (x >= viewportWidth - EDGE_ZONE_PX) {
    return "right";
  }
  return null;
}

/**
 * Locks a gesture to an axis once the finger has moved far enough to mean it.
 * Until then the gesture is ambiguous, and a vertical lock hands the touch back
 * to scrolling untouched.
 */
export function swipeAxis(start: SwipeStart, x: number, y: number): SwipeAxis {
  const dx = Math.abs(x - start.x);
  const dy = Math.abs(y - start.y);
  if (dx < AXIS_LOCK_PX && dy < AXIS_LOCK_PX) {
    return null;
  }
  return dx > dy ? "x" : "y";
}

/**
 * The sheet an edge swipe asks to open, given the panels that exist on the
 * current route. A left-edge pull opens the tree; a right-edge pull opens the
 * inspector when the route has one.
 */
export function edgeSwipeOpens(
  start: SwipeStart,
  x: number,
  hasSidebar: boolean,
  hasMetadata: boolean,
): "sidebar" | "metadata" | null {
  const dx = x - start.x;
  if (start.edge === "left" && hasSidebar && dx >= OPEN_DISTANCE_PX) {
    return "sidebar";
  }
  if (start.edge === "right" && hasMetadata && dx <= -OPEN_DISTANCE_PX) {
    return "metadata";
  }
  return null;
}

/**
 * How far a sheet anchored to `side` has been pushed toward its edge, clamped
 * so a pull away from the edge never drags it into the page.
 */
export function sheetDragOffset(side: SwipeEdge, dx: number): number {
  return side === "left" ? Math.min(0, dx) : Math.max(0, dx);
}

export function sheetDragCloses(side: SwipeEdge, dx: number): boolean {
  return Math.abs(sheetDragOffset(side, dx)) >= CLOSE_DISTANCE_PX;
}
