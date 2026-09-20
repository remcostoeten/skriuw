export type RowGesture =
  | { kind: "idle" }
  | { kind: "pending"; x: number; y: number; rowId: string }
  | { kind: "swipe"; x: number; y: number; rowId: string; offset: number }
  | { kind: "cancelled" };

export const LONG_PRESS_MS = 450;
export const SWIPE_LOCK_PX = 12;
export const SCROLL_SLOP_PX = 10;
export const SWIPE_DELETE_PX = 96;
export const SWIPE_MAX_PX = 140;

export function beginRowGesture(rowId: string, x: number, y: number): RowGesture {
  return { kind: "pending", x, y, rowId };
}

/**
 * Advances a touch on a tree row, on the same numbers as
 * `app/src/features/sidebar/touch-gestures.ts`. A horizontal pull becomes a
 * swipe that drags the row toward deletion; a vertical pull is the list
 * scrolling and cancels everything, including the pending long press;
 * anything smaller keeps the long press armed.
 */
export function moveRowGesture(gesture: RowGesture, x: number, y: number): RowGesture {
  if (gesture.kind === "pending") {
    const dx = x - gesture.x;
    const dy = y - gesture.y;
    if (Math.abs(dy) >= SCROLL_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
      return { kind: "cancelled" };
    }
    if (dx <= -SWIPE_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
      return { ...gesture, kind: "swipe", offset: swipeOffset(dx) };
    }
    if (dx >= SWIPE_LOCK_PX) {
      return { kind: "cancelled" };
    }
    return gesture;
  }
  if (gesture.kind === "swipe") {
    return { ...gesture, offset: swipeOffset(x - gesture.x) };
  }
  return gesture;
}

/** Leftward travel the row shows, resisting past the delete point. */
export function swipeOffset(dx: number): number {
  const pull = Math.max(0, -dx);
  if (pull === 0) {
    return 0;
  }
  if (pull <= SWIPE_DELETE_PX) {
    return -pull;
  }
  const beyond = pull - SWIPE_DELETE_PX;
  return -Math.min(SWIPE_MAX_PX, SWIPE_DELETE_PX + beyond * 0.35);
}

export function swipeDeletes(gesture: RowGesture): boolean {
  return gesture.kind === "swipe" && -gesture.offset >= SWIPE_DELETE_PX;
}

/** Whether releasing now should be treated as a tap on the row. */
export function releaseIsTap(gesture: RowGesture): boolean {
  return gesture.kind === "pending";
}
