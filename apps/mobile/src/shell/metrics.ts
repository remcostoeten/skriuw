/**
 * The compact shell's measurements, held once so the native views and their
 * tests read the same numbers as `apps/workspace/src/shell/mobile.css`.
 */

/** Tab bar body height; the home-indicator inset is added below it. */
export const TAB_BAR_HEIGHT = 56;

export const TAB_ICON_SIZE = 20;

export const TAB_LABEL_SIZE = 10;

/** Alpha a tab's icon and label rest at until it is the current destination. */
export const TAB_RESTING_ALPHA = 0.55;

export const TOOLBAR_HEIGHT = 44;

/** Smallest control a thumb is asked to hit (`docs/specs/mobile-app.md`, R-Q2). */
export const MINIMUM_TOUCH_TARGET = 44;

export const TREE_ROW_HEIGHT = 44;

export const SHEET_MAXIMUM_WIDTH = 360;

export const SHEET_WIDTH_FRACTION = 0.86;

export const SHEET_DURATION_MS = 260;

/** `cubic-bezier(0.32, 0.72, 0, 1)`, the curve every sheet in the shell travels on. */
export const SHEET_EASING = { x1: 0.32, y1: 0.72, x2: 0, y2: 1 } as const;

export const SCRIM_ALPHA = 0.5;

/** `min(86vw, 360px)` resolved against a window width. */
export function sheetWidth(windowWidth: number): number {
  return Math.min(windowWidth * SHEET_WIDTH_FRACTION, SHEET_MAXIMUM_WIDTH);
}
