import {
  ICON_MOTIONS,
  ICON_REGISTRY,
  motionDuration,
  samplePose,
  selectGlyph,
  type AnimatedIconId,
  type ResolvedPose,
} from "@skriuw/icons";
import type { ShellIconName } from "./destinations";

export type Affine = [number, number, number, number, number, number];

export type PartPose = { matrix: Affine; opacity: number };

export type MotionSamples = {
  readonly length: number;
  readonly times: Float64Array;
  readonly parts: ReadonlyMap<string, Float64Array>;
};

/** Mobile draws every shell icon on the 24-unit grid its animation uses. */
export const SHELL_ICON_GRID = 24;

const SAMPLES_PER_SECOND = 120;
const VALUES_PER_SAMPLE = 7;
const SAME_TIME_MS = 1e-6;

const sampledMotions = new Map<AnimatedIconId, MotionSamples>();

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

function poseMatrix(pose: ResolvedPose, [ox, oy]: readonly [number, number]): Affine {
  const radians = (pose.rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const skew = Math.tan((pose.skewX * Math.PI) / 180);
  const a = cos * pose.scaleX;
  const b = sin * pose.scaleX;
  const c = a * skew - sin * pose.scaleY;
  const d = b * skew + cos * pose.scaleY;
  return [a, b, c, d, ox + pose.x - a * ox - c * oy, oy + pose.y - b * ox - d * oy];
}

function sampleTimes(motion: AnimatedIconId, length: number): Float64Array {
  const intervals = Math.ceil((length * SAMPLES_PER_SECOND) / 1000);
  const times = Array.from({ length: intervals + 1 }, (_, sample) => (sample * length) / intervals);
  for (const track of ICON_MOTIONS[motion].tracks) {
    for (const keyframe of track.keyframes) {
      times.push((track.delay ?? 0) + keyframe.at * track.duration);
    }
  }
  const sorted = new Float64Array(times).sort();
  return sorted.filter((time, index) => index === 0 || time - sorted[index - 1]! > SAME_TIME_MS);
}

/**
 * @name shellMotionSamples
 * @description Samples every moving part of an icon's motion from the same
 * spec the desktop plays with WAAPI, 120 times a second and on every keyframe,
 * so interpolating between samples never smooths over a keyframe. Each sample
 * holds the part's SVG matrix about its origin, `a b c d e f`, followed by its
 * opacity. Computed once per motion and shared by every icon that plays it.
 *
 * @example
 * const { length, times, parts } = shellMotionSamples("plus");
 * const arms = parts.get("arms");
 */
export function shellMotionSamples(motion: AnimatedIconId): MotionSamples {
  const cached = sampledMotions.get(motion);
  if (cached) return cached;
  const length = shellMotionLength(motion);
  const times = sampleTimes(motion, length);
  const parts = new Map<string, Float64Array>();
  for (const track of ICON_MOTIONS[motion].tracks) {
    const values = new Float64Array(times.length * VALUES_PER_SAMPLE);
    times.forEach((time, sample) => {
      const pose = samplePose(track, time);
      values.set([...poseMatrix(pose, track.origin), pose.opacity], sample * VALUES_PER_SAMPLE);
    });
    parts.set(track.part, values);
  }
  const samples: MotionSamples = { length, times, parts };
  sampledMotions.set(motion, samples);
  return samples;
}

/**
 * @name shellPartPose
 * @description A part's matrix and opacity `elapsed` milliseconds into its
 * motion, interpolated between the samples on either side and held at the
 * first and last sample outside the motion. A worklet, so the UI thread can
 * drive it from a shared clock without a React render per frame.
 *
 * @example
 * const { times, parts } = shellMotionSamples("plus");
 * const { matrix, opacity } = shellPartPose(times, parts.get("arms")!, 250);
 */
export function shellPartPose(
  times: Float64Array,
  values: Float64Array,
  elapsed: number,
): PartPose {
  "worklet";
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (times[middle]! <= elapsed) low = middle;
    else high = middle;
  }
  const span = times[high]! - times[low]!;
  const weight = Math.min(Math.max((elapsed - times[low]!) / span, 0), 1);
  const from = low * VALUES_PER_SAMPLE;
  const to = high * VALUES_PER_SAMPLE;
  function mix(offset: number): number {
    return values[from + offset]! + (values[to + offset]! - values[from + offset]!) * weight;
  }
  return { matrix: [mix(0), mix(1), mix(2), mix(3), mix(4), mix(5)], opacity: mix(6) };
}
