export type DrawerSide = "left" | "right";

export type DrawerPanel = "sidebar" | "metadata";

export type DrawerAvailability = {
  sidebarOpen: boolean;
  metadataOpen: boolean;
  hasSidebar: boolean;
  hasMetadata: boolean;
};

export type PointerSample = {
  x: number;
  time: number;
};

export type SwipeIntent = "undecided" | "horizontal" | "vertical";

/** Pixels a touch must travel before the gesture commits to an axis. */
export const SWIPE_INTENT_DISTANCE = 10;

/** A touch held this long before moving is a long-press, not a swipe. */
export const SWIPE_LONG_PRESS_MS = 350;

/** Release speed (px/ms) above which the fling direction wins over position. */
export const FLICK_VELOCITY = 0.35;

const VELOCITY_WINDOW_MS = 80;

const RUBBER_BAND_COEFFICIENT = 0.55;

/**
 * UIKit's scroll-view resistance curve: travel past a limit starts at roughly
 * half speed and flattens so the drawer never moves more than `dimension`
 * beyond it, however far the finger goes.
 */
export function rubberBand(overshoot: number, dimension: number): number {
  if (overshoot <= 0 || dimension <= 0) {
    return 0;
  }
  return (1 - 1 / ((overshoot * RUBBER_BAND_COEFFICIENT) / dimension + 1)) * dimension;
}

/**
 * Visible drawer extent for a finger that started with the drawer `start` px
 * open and moved `delta` px in the opening direction. Pulling past fully open
 * stretches with resistance; pulling past closed stops at the edge, since a
 * hidden drawer has nothing to show.
 */
export function drawerProgress(start: number, delta: number, width: number): number {
  const raw = start + delta;
  if (raw <= 0) {
    return 0;
  }
  if (raw <= width) {
    return raw;
  }
  return width + rubberBand(raw - width, width);
}

/** Decides an axis once the finger has travelled far enough to be sure. */
export function classifySwipe(dx: number, dy: number): SwipeIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_INTENT_DISTANCE && ay < SWIPE_INTENT_DISTANCE) {
    return "undecided";
  }
  return ax > ay * 1.2 ? "horizontal" : "vertical";
}

/**
 * Which drawer a horizontal swipe addresses. An open drawer always owns the
 * gesture (so dragging it further only stretches it), otherwise the swipe
 * direction picks the drawer it would reveal.
 */
export function pickDrawer(dx: number, state: DrawerAvailability): DrawerPanel | null {
  if (state.sidebarOpen) {
    return "sidebar";
  }
  if (state.metadataOpen) {
    return "metadata";
  }
  if (dx > 0 && state.hasSidebar) {
    return "sidebar";
  }
  if (dx < 0 && state.hasMetadata) {
    return "metadata";
  }
  return null;
}

/** Converts a screen-space horizontal delta into the drawer's opening direction. */
export function openingDelta(side: DrawerSide, dx: number): number {
  return side === "left" ? dx : -dx;
}

/**
 * Release velocity in px/ms from the trailing samples of a gesture, using the
 * oldest sample still inside the window so a finger that paused reads as
 * still, not as its earlier fling.
 */
export function releaseVelocity(samples: readonly PointerSample[]): number {
  const last = samples[samples.length - 1];
  if (!last) {
    return 0;
  }
  let anchor: PointerSample = last;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const sample = samples[index];
    if (!sample || last.time - sample.time > VELOCITY_WINDOW_MS) {
      break;
    }
    anchor = sample;
  }
  const elapsed = last.time - anchor.time;
  if (elapsed <= 0) {
    return 0;
  }
  return (last.x - anchor.x) / elapsed;
}

/** Keeps only the samples a velocity estimate can use. */
export function pushSample(
  samples: PointerSample[],
  sample: PointerSample,
): PointerSample[] {
  const cutoff = sample.time - VELOCITY_WINDOW_MS * 2;
  const kept = samples.filter((entry) => entry.time >= cutoff);
  kept.push(sample);
  return kept;
}

/**
 * Whether a released drawer should settle open. A flick wins in its own
 * direction; a slow release lands on the nearer rest position.
 */
export function resolveDrawerSettle(
  progress: number,
  width: number,
  velocity: number,
): boolean {
  if (Math.abs(velocity) >= FLICK_VELOCITY) {
    return velocity > 0;
  }
  return progress > width / 2;
}

/** Screen-space translate that shows `progress` px of a drawer `width` wide. */
export function drawerTranslate(side: DrawerSide, progress: number, width: number): number {
  return side === "left" ? progress - width : width - progress;
}
