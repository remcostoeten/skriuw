import type { Transition } from "framer-motion";

/**
 * Shared motion vocabulary.
 *
 * Centralizing easings + transition factories here gives the app a single
 * motion identity and one place to honor `prefers-reduced-motion`. Prefer
 * these over ad-hoc per-file constants so the feel of the UI stays
 * consistent.
 */

/** Material-style ease-out for general element entrances. */
export const EASE_OUT_QUART = [0.22, 1, 0.36, 1] as const satisfies readonly [
	number,
	number,
	number,
	number,
];

/** Sheet / overlay transitions — slightly longer, smoother. */
export const EASE_SHEET = [0.32, 0.72, 0, 1] as const satisfies readonly [
	number,
	number,
	number,
	number,
];

/** Default duration for small interactive transitions (px-level swaps). */
export const DURATION_FAST = 0.18;

/** Default duration for panels/sheets. */
export const DURATION_SHEET = 0.5;

/** A reduced-motion-friendly transition — short and linear. */
export const REDUCED_MOTION_TRANSITION: Transition = {
	duration: 0.1,
	ease: "linear",
};

/**
 * Build a transition that automatically degrades when the user prefers
 * reduced motion.
 *
 * @example
 *   const t = pickTransition(prefersReducedMotion, { duration: 0.18, ease: EASE_OUT_QUART });
 */
export function pickTransition(prefersReducedMotion: boolean, full: Transition): Transition {
	return prefersReducedMotion ? REDUCED_MOTION_TRANSITION : full;
}

/** Pre-baked transition for fast element swaps (e.g. search header). */
export const FAST_SWAP_TRANSITION: Transition = {
	duration: DURATION_FAST,
	ease: EASE_OUT_QUART,
};

/** Pre-baked transition for sheets / overlays. */
export const SHEET_TRANSITION: Transition = {
	duration: DURATION_SHEET,
	ease: EASE_SHEET,
};
