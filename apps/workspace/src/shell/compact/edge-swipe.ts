import type { SwipeEdge, SwipeStart } from "@/shared/touch/swipe";

export const OPEN_DISTANCE_PX = 56;
export const CLOSE_DISTANCE_PX = 72;

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
