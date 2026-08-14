import { clampSplitRatio, type SplitOrientation } from "@/store/panes";

/** Ratio a single arrow-key press moves the divider. */
export const SPLIT_NUDGE_STEP = 0.02;

/** Coarse step for shift+arrow, standing in for the Home/End jump. */
export const SPLIT_COARSE_STEP = 0.1;

/**
 * Grid tracks for a split: pane 1, the 1px divider, pane 2. The divider keeps a
 * fixed pixel track so the ratio describes the panes alone, and both panes take
 * `minmax(0, …)` so a wide note never inflates its track past the ratio.
 */
export function splitGridTemplate(ratio: number): string {
  const first = clampSplitRatio(ratio);
  return `minmax(0, ${first}fr) 1px minmax(0, ${1 - first}fr)`;
}

export function splitTrackProperty(
  orientation: SplitOrientation,
): "gridTemplateColumns" | "gridTemplateRows" {
  return orientation === "vertical" ? "gridTemplateColumns" : "gridTemplateRows";
}

/**
 * The ratio a pointer at `position` puts the divider at, given the split
 * container's start edge and extent along the drag axis. A zero extent — the
 * container is not laid out yet — yields the default ratio rather than a
 * division blow-up.
 */
export function ratioAtPointer(position: number, start: number, extent: number): number {
  return clampSplitRatio((position - start) / extent);
}
