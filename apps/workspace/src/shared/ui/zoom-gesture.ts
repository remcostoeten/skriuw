import { pullCloses } from "./dialog-pull";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP_PX = 24;

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type ZoomTransform = { scale: number; x: number; y: number };

export const IDENTITY_ZOOM: ZoomTransform = { scale: 1, x: 0, y: 0 };

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

export function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Keeps a scaled image covering its stage: the image may pan only as far as
 * its overflow on each axis, so an edge never pulls in past the stage border.
 */
export function clampPan(transform: ZoomTransform, stage: Size, content: Size): ZoomTransform {
  const limitX = Math.max(0, (content.width * transform.scale - stage.width) / 2);
  const limitY = Math.max(0, (content.height * transform.scale - stage.height) / 2);
  return {
    scale: transform.scale,
    x: Math.min(limitX, Math.max(-limitX, transform.x)),
    y: Math.min(limitY, Math.max(-limitY, transform.y)),
  };
}

/**
 * Rescales around `focus` (relative to the stage centre) so the image point
 * under the finger stays under the finger.
 */
export function zoomAround(
  transform: ZoomTransform,
  focus: Point,
  nextScale: number,
): ZoomTransform {
  const scale = clampZoom(nextScale);
  const ratio = scale / transform.scale;
  return {
    scale,
    x: focus.x - (focus.x - transform.x) * ratio,
    y: focus.y - (focus.y - transform.y) * ratio,
  };
}

/** Double tap zooms in on the tapped point, or back out when already zoomed. */
export function toggleZoom(transform: ZoomTransform, focus: Point): ZoomTransform {
  if (transform.scale > MIN_ZOOM) return IDENTITY_ZOOM;
  return zoomAround(transform, focus, DOUBLE_TAP_ZOOM);
}

export function isDoubleTap(
  previous: { time: number; point: Point } | null,
  time: number,
  point: Point,
): boolean {
  if (previous === null) return false;
  return (
    time - previous.time <= DOUBLE_TAP_MS &&
    pointDistance(previous.point, point) <= DOUBLE_TAP_SLOP_PX
  );
}

/** A mostly vertical downward drag on an unzoomed image dismisses the viewer. */
export function swipeDismisses(scale: number, dx: number, dy: number): boolean {
  return scale <= MIN_ZOOM && Math.abs(dx) < dy && pullCloses(dy);
}
