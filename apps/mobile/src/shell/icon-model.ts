import {
  ICON_MOTIONS,
  ICON_REGISTRY,
  motionDuration,
  samplePose,
  selectGlyph,
  svgTransform,
  type AnimatedIconId,
} from "@skriuw/icons";
import type { ShellIconName } from "./destinations";

export type PartFrame = { readonly transform: string; readonly opacity: number };

/** Mobile draws every shell icon on the 24-unit grid its animation uses. */
export const SHELL_ICON_GRID = 24;

export function shellGlyph(name: ShellIconName): { d: string; motion: AnimatedIconId | undefined } {
  const entry = ICON_REGISTRY[name];
  return {
    d: selectGlyph(entry.glyph, SHELL_ICON_GRID, SHELL_ICON_GRID).d,
    motion: "motion" in entry ? entry.motion : undefined,
  };
}

export function shellMotionLength(motion: AnimatedIconId): number {
  return motionDuration(ICON_MOTIONS[motion]);
}

/**
 * Every moving part's SVG transform and opacity `elapsed` milliseconds into an
 * icon's motion, from the same spec the desktop plays with WAAPI.
 */
export function shellMotionFrame(
  motion: AnimatedIconId,
  elapsed: number,
): ReadonlyMap<string, PartFrame> {
  const frame = new Map<string, PartFrame>();
  for (const track of ICON_MOTIONS[motion].tracks) {
    const pose = samplePose(track, elapsed);
    frame.set(track.part, { transform: svgTransform(pose, track.origin), opacity: pose.opacity });
  }
  return frame;
}
