export type Point = { x: number; y: number };

export type OutlineRow = { depth: number; top: number; height: number };

export type OutlinePathPoints = { points: Point[]; anchors: number[] };

/**
 * @name GEOMETRY
 * @description Layout and motion constants shared by the outline path math
 * and the outline controller.
 *
 * @example
 * const x = 7 + depth * GEOMETRY.indent;
 */
export const GEOMETRY = {
  indent: 14,
  rowHeight: 30,
  rowGap: 2,
  lineWidth: 1.5,
  corner: 8,
  smoothing: 0.18,
  damping: 0.76,
  anchorFraction: 0.28,
};

const X_BASE = 7;

export type PathSegment = { from: Point; control: Point | null; to: Point };

const QUADRATIC_CHORDS = 12;

/**
 * @name roundedSegments
 * @description Splits a polyline into the straight and quadratic segments of
 * its rounded path, replacing each interior corner with a quadratic curve of
 * at most `radius`.
 *
 * @example
 * const segments = roundedSegments(points, GEOMETRY.corner);
 */
export function roundedSegments(points: Point[], radius: number): PathSegment[] {
  if (points.length < 2) {
    return [];
  }

  const segments: PathSegment[] = [];
  let cursor = points[0]!;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;

    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const localRadius = Math.min(radius, incoming / 2, outgoing / 2);

    const startRatio = incoming ? localRadius / incoming : 0;
    const endRatio = outgoing ? localRadius / outgoing : 0;

    const start = {
      x: current.x + (previous.x - current.x) * startRatio,
      y: current.y + (previous.y - current.y) * startRatio,
    };
    const end = {
      x: current.x + (next.x - current.x) * endRatio,
      y: current.y + (next.y - current.y) * endRatio,
    };

    segments.push({ from: cursor, control: null, to: start });
    segments.push({ from: start, control: current, to: end });
    cursor = end;
  }

  segments.push({ from: cursor, control: null, to: points.at(-1)! });
  return segments;
}

/**
 * @name roundedPath
 * @description Builds an SVG path through the given points, replacing each
 * interior corner with a quadratic curve of at most `radius`.
 *
 * @example
 * path.setAttribute("d", roundedPath(points, GEOMETRY.corner));
 */
export function roundedPath(points: Point[], radius: number): string {
  const segments = roundedSegments(points, radius);
  if (segments.length === 0) {
    return "";
  }
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (const segment of segments) {
    path += segment.control
      ? ` Q ${segment.control.x} ${segment.control.y} ${segment.to.x} ${segment.to.y}`
      : ` L ${segment.to.x} ${segment.to.y}`;
  }
  return path;
}

function quadraticPoint(segment: PathSegment, t: number): Point {
  const control = segment.control ?? segment.from;
  const inverse = 1 - t;
  return {
    x: inverse * inverse * segment.from.x + 2 * inverse * t * control.x + t * t * segment.to.x,
    y: inverse * inverse * segment.from.y + 2 * inverse * t * control.y + t * t * segment.to.y,
  };
}

function segmentPoints(segment: PathSegment): Point[] {
  if (!segment.control) {
    return [segment.from, segment.to];
  }
  const points = [segment.from];
  for (let chord = 1; chord <= QUADRATIC_CHORDS; chord += 1) {
    points.push(quadraticPoint(segment, chord / QUADRATIC_CHORDS));
  }
  return points;
}

/**
 * @name lengthsAtY
 * @description Walks a path whose `y` never decreases along its length and
 * returns, for each ascending `y`, the shortest length along the path that
 * reaches it, plus the path's total length. Straight segments are exact and
 * quadratic corners are summed over short chords.
 *
 * @example
 * const { lengths, total } = lengthsAtY(roundedSegments(points, 8), anchorYs);
 */
export function lengthsAtY(
  segments: readonly PathSegment[],
  ys: readonly number[],
): { lengths: number[]; total: number } {
  const lengths: number[] = [];
  let travelled = 0;
  let next = 0;

  for (const segment of segments) {
    const points = segmentPoints(segment);
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]!;
      const to = points[index]!;
      const span = Math.hypot(to.x - from.x, to.y - from.y);
      while (next < ys.length && to.y >= ys[next]!) {
        const rise = to.y - from.y;
        const ratio = rise > 0 ? Math.max(0, Math.min(1, (ys[next]! - from.y) / rise)) : 0;
        lengths.push(travelled + span * ratio);
        next += 1;
      }
      travelled += span;
    }
  }

  while (lengths.length < ys.length) {
    lengths.push(travelled);
  }
  return { lengths, total: travelled };
}

/**
 * @name pathPoints
 * @description Computes the outline line's polyline from link rows measured
 * relative to the outline nav. The line runs top to bottom and steps across
 * at a bridge height wherever the depth changes; `anchors` holds the index of
 * each row's point in `points`.
 *
 * @example
 * const { points, anchors } = pathPoints([
 *   { depth: 0, top: 0, height: 30 },
 *   { depth: 1, top: 32, height: 30 },
 * ]);
 */
export function pathPoints(rows: readonly OutlineRow[]): OutlinePathPoints {
  const points: Point[] = [];
  const anchors: number[] = [];

  for (const row of rows) {
    const x = X_BASE + row.depth * GEOMETRY.indent;
    const y = row.top + row.height / 2;

    if (points.length === 0) {
      points.push({ x, y: Math.max(2, row.top + 2) });
    }

    const previous = points.at(-1)!;

    if (Math.abs(previous.x - x) > 0.01) {
      const direction = x > previous.x ? 1 : -1;
      const bridgeY = Math.max(previous.y + 8, y - row.height * 0.58);
      points.push({ x: previous.x, y: bridgeY });
      points.push({ x: x - direction * Math.min(2, GEOMETRY.corner * 0.18), y: bridgeY });
    }

    points.push({ x, y });
    anchors.push(points.length - 1);
  }

  return { points, anchors };
}
