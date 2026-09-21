import { evaluateEasing } from "./easing";
import type { Keyframe, Pose, Track } from "./motion";

export type ResolvedPose = Required<Omit<Pose, "scale">>;

const IDENTITY: ResolvedPose = { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, skewX: 0, opacity: 1 };

/** Fills in the identity for every field a keyframe leaves out. */
export function resolvePose(pose: Pose): ResolvedPose {
  return {
    x: pose.x ?? IDENTITY.x,
    y: pose.y ?? IDENTITY.y,
    rotate: pose.rotate ?? IDENTITY.rotate,
    scaleX: pose.scaleX ?? pose.scale ?? IDENTITY.scaleX,
    scaleY: pose.scaleY ?? pose.scale ?? IDENTITY.scaleY,
    skewX: pose.skewX ?? IDENTITY.skewX,
    opacity: pose.opacity ?? IDENTITY.opacity,
  };
}

export function isIdentityPose(pose: Pose): boolean {
  const resolved = resolvePose(pose);
  return (Object.keys(IDENTITY) as (keyof ResolvedPose)[]).every(
    (key) => Math.abs(resolved[key] - IDENTITY[key]) < 1e-9,
  );
}

function mix(from: ResolvedPose, to: ResolvedPose, t: number): ResolvedPose {
  const mixed = { ...from };
  for (const key of Object.keys(IDENTITY) as (keyof ResolvedPose)[]) {
    mixed[key] = from[key] + (to[key] - from[key]) * t;
  }
  return mixed;
}

/**
 * The pose of a track's part `elapsed` milliseconds after the animation
 * started, including the track's delay. Before the delay and after the end the
 * part holds its first and last keyframes.
 */
export function samplePose(track: Track, elapsed: number): ResolvedPose {
  const keyframes: readonly Keyframe[] = track.keyframes;
  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  const progress = (elapsed - (track.delay ?? 0)) / track.duration;
  if (progress <= first.at) return resolvePose(first);
  if (progress >= last.at) return resolvePose(last);
  let index = 0;
  while (keyframes[index + 1]!.at < progress) index += 1;
  const from = keyframes[index]!;
  const to = keyframes[index + 1]!;
  const span = to.at - from.at;
  const local = span === 0 ? 1 : (progress - from.at) / span;
  return mix(resolvePose(from), resolvePose(to), evaluateEasing(from.ease ?? track.ease, local));
}

function number(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

/**
 * The pose as an SVG `transform` attribute about `origin`, in grid units. The
 * order matches the CSS the motion was designed in: translate, rotate, scale,
 * skew.
 */
export function svgTransform(pose: ResolvedPose, origin: readonly [number, number]): string {
  const [ox, oy] = origin;
  return [
    `translate(${number(ox + pose.x)} ${number(oy + pose.y)})`,
    `rotate(${number(pose.rotate)})`,
    `scale(${number(pose.scaleX)} ${number(pose.scaleY)})`,
    `skewX(${number(pose.skewX)})`,
    `translate(${number(-ox)} ${number(-oy)})`,
  ].join(" ");
}

/** The pose as a CSS `transform`, for an element whose origin is set separately. */
export function cssTransform(pose: ResolvedPose): string {
  return [
    `translate(${number(pose.x)}px, ${number(pose.y)}px)`,
    `rotate(${number(pose.rotate)}deg)`,
    `scale(${number(pose.scaleX)}, ${number(pose.scaleY)})`,
    `skewX(${number(pose.skewX)}deg)`,
  ].join(" ");
}

/** Maps a point through the pose about `origin`, for geometry checks. */
export function transformPoint(
  pose: ResolvedPose,
  origin: readonly [number, number],
  [px, py]: readonly [number, number],
): [number, number] {
  const [ox, oy] = origin;
  const skew = Math.tan((pose.skewX * Math.PI) / 180);
  let x = px - ox;
  let y = py - oy;
  x += skew * y;
  x *= pose.scaleX;
  y *= pose.scaleY;
  const radians = (pose.rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos * x - sin * y + ox + pose.x, sin * x + cos * y + oy + pose.y];
}
