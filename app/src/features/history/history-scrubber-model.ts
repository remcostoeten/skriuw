/**
 * Geometry for the revision scrubber. Positions run oldest (0) to newest
 * (count - 1) left to right; the version list itself is newest-first, so
 * list indices and positions mirror each other. Revisions are spaced evenly
 * rather than by time so bursts of saves stay individually reachable, and
 * zoom narrows the visible window instead of scaling time.
 */

export const SCRUBBER_MAX_STEP_PX = 44;
export const SCRUBBER_WINDOW_MARGIN = 0.12;

export type ScrubberWindow = {
  start: number;
  size: number;
};

/** Converts a newest-first list index into a left-to-right track position. */
export function listIndexToPosition(listIndex: number, count: number): number {
  return count - 1 - listIndex;
}

/** Converts a (possibly fractional) track position to the nearest list index. */
export function positionToListIndex(position: number, count: number): number {
  const snapped = Math.round(clampPosition(position, count));
  return count - 1 - snapped;
}

export function clampPosition(position: number, count: number): number {
  return Math.min(Math.max(position, 0), Math.max(count - 1, 0));
}

/** The largest zoom at which one revision step is still at most `SCRUBBER_MAX_STEP_PX` wide. */
export function maxZoom(count: number, trackWidth: number): number {
  const span = count - 1;
  if (span <= 0 || trackWidth <= 0) {
    return 1;
  }
  return Math.max(1, (span * SCRUBBER_MAX_STEP_PX) / trackWidth);
}

export function clampZoom(zoom: number, count: number, trackWidth: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  return Math.min(Math.max(zoom, 1), maxZoom(count, trackWidth));
}

/**
 * Moves the visible window as little as possible so `position` stays inside
 * its inner margins, keeping the window within the track.
 */
export function followWindow(
  position: number,
  count: number,
  zoom: number,
  previousStart: number,
): ScrubberWindow {
  const span = Math.max(count - 1, 0);
  const size = span / Math.max(zoom, 1);
  if (size >= span) {
    return { start: 0, size: span };
  }
  const margin = size * SCRUBBER_WINDOW_MARGIN;
  let start = previousStart;
  if (position < start + margin) {
    start = position - margin;
  } else if (position > start + size - margin) {
    start = position - size + margin;
  }
  return { start: Math.min(Math.max(start, 0), span - size), size };
}

/**
 * Resizes the window for a new zoom while `position` keeps its on-screen
 * fraction, so pinching feels anchored to the handle.
 */
export function zoomWindow(
  position: number,
  count: number,
  zoom: number,
  previous: ScrubberWindow,
): ScrubberWindow {
  const span = Math.max(count - 1, 0);
  const size = span / Math.max(zoom, 1);
  if (size >= span) {
    return { start: 0, size: span };
  }
  const fraction = Math.min(Math.max(positionToFraction(position, previous), 0), 1);
  const start = position - fraction * size;
  return { start: Math.min(Math.max(start, 0), span - size), size };
}

/** Horizontal offset of `position` inside the window, as a 0–1 fraction. */
export function positionToFraction(position: number, view: ScrubberWindow): number {
  if (view.size <= 0) {
    return 1;
  }
  return (position - view.start) / view.size;
}

export function fractionToPosition(fraction: number, view: ScrubberWindow): number {
  return view.start + fraction * view.size;
}

/** How many track positions one pixel of pointer travel covers. */
export function positionsPerPixel(view: ScrubberWindow, trackWidth: number): number {
  return trackWidth > 0 ? view.size / trackWidth : 0;
}

export function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
