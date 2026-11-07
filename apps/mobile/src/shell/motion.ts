import { Easing, cubicBezier } from "react-native-reanimated";
import { SHEET_EASING } from "./metrics";

export const PRESS_SCALE = 0.97;
export const PRESS_MS = 120;
export const PRESS_EASING = cubicBezier(0.23, 1, 0.32, 1);

export const TOAST_ENTER_MS = 300;
export const TOAST_EXIT_MS = 240;

export const STATE_MS = 150;

export const SETTLE_SPRING = { duration: 300, dampingRatio: 1, overshootClamping: true } as const;
export const SNAP_BACK_SPRING = { duration: 400, dampingRatio: 0.8 } as const;

// Larger than the row swipe lock (12) so a row swipe wins over a sheet drag.
export const SHEET_PAN_LOCK_PX = 16;
export const PAN_REACH_PX = 10_000;

export const SHEET_CURVE = Easing.bezier(
  SHEET_EASING.x1,
  SHEET_EASING.y1,
  SHEET_EASING.x2,
  SHEET_EASING.y2,
);
export const CLOSE_PROJECTION_FRACTION = 0.4;

/**
 * @name projectVelocity
 * @description Where a drag would come to rest if it kept decelerating, using
 * Apple's exponential-decay form. A fast short flick projects far, a slow
 * long drag does not, so a release commits on intent rather than distance.
 *
 * @example
 * const resting = offset + projectVelocity(event.velocityX);
 */
export function projectVelocity(velocity: number, decelerationRate = 0.998): number {
  "worklet";
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * @name clamp
 * @description Pins a value between a minimum and a maximum.
 *
 * @example
 * progress.set(clamp(next, 0, 1));
 */
export function clamp(value: number, minimum: number, maximum: number): number {
  "worklet";
  return Math.min(maximum, Math.max(minimum, value));
}
