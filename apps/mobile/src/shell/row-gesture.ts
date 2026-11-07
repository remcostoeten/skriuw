import { projectVelocity } from "./motion";

export const LONG_PRESS_MS = 450;
export const SWIPE_LOCK_PX = 12;
export const SCROLL_SLOP_PX = 10;
export const SWIPE_DELETE_PX = 96;
export const SWIPE_MAX_PX = 140;

/**
 * @name swipeOffset
 * @description Leftward travel a tree row shows for a horizontal drag of `dx`
 * points: it follows the finger up to the delete point and resists past it,
 * on the same numbers as `apps/workspace/src/features/sidebar/touch/gestures.ts`.
 *
 * @example
 * offset.set(swipeOffset(event.translationX - origin));
 */
export function swipeOffset(dx: number): number {
  "worklet";
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

/**
 * @name swipeDeletes
 * @description Whether releasing a row at `offset` with `velocityX` deletes
 * it. Past the delete point always deletes; from halfway, a flick that was
 * heading twice as far deletes too, and anything shorter springs back.
 *
 * @example
 * if (swipeDeletes(offset.get(), event.velocityX)) {
 *   slideOut();
 * }
 */
export function swipeDeletes(offset: number, velocityX: number): boolean {
  "worklet";
  const travelled = -offset;
  if (travelled >= SWIPE_DELETE_PX) {
    return true;
  }
  return (
    travelled >= SWIPE_DELETE_PX / 2 &&
    travelled - projectVelocity(velocityX) >= SWIPE_DELETE_PX * 2
  );
}
