/**
 * Constrains a number to inclusive bounds without rounding it.
 *
 * @param value - The number to constrain.
 * @param minimum - The lower bound; callers must supply minimum <= maximum.
 * @param maximum - The upper bound.
 * @returns The bounded value, or NaN if any argument is NaN.
 *
 * @example
 * ```ts
 * import { clamp } from "@skriuw/shared/helpers/clamp";
 *
 * const opacity = clamp(1.2, 0, 1);
 * const focalPosition = clamp(-0.3, 0, 1);
 * ```
 */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
