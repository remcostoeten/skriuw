import { swipeAxis, type SwipeStart } from "@/shell/edge-swipe";

export const DAY_SWIPE_DISTANCE_PX = 64;

/**
 * The day step a finished horizontal drag asks for: pulling the page to the
 * right reveals the previous day, to the left the next one. Drags that locked
 * to the vertical axis, or stopped short, step nowhere.
 */
export function daySwipeStep(start: SwipeStart, x: number, y: number): -1 | 0 | 1 {
  if (swipeAxis(start, x, y) !== "x") {
    return 0;
  }
  const dx = x - start.x;
  if (Math.abs(dx) < DAY_SWIPE_DISTANCE_PX) {
    return 0;
  }
  return dx > 0 ? -1 : 1;
}
