export type SwipeEdge = "left" | "right";

export type SwipeStart = {
  x: number;
  y: number;
  edge: SwipeEdge | null;
};

export type SwipeAxis = "x" | "y" | null;

export const EDGE_ZONE_PX = 24;
export const AXIS_LOCK_PX = 10;

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
