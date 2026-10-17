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
const MAX_SEARCH_ITERATIONS = 18;
const SEARCH_PRECISION = 0.25;

/**
 * @name roundedPath
 * @description Builds an SVG path through the given points, replacing each
 * interior corner with a quadratic curve of at most `radius`.
 *
 * @example
 * path.setAttribute("d", roundedPath(points, GEOMETRY.corner));
 */
export function roundedPath(points: Point[], radius: number): string {
  if (points.length < 2) {
    return "";
  }

  let path = `M ${points[0]!.x} ${points[0]!.y}`;

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

    path += ` L ${start.x} ${start.y}`;
    path += ` Q ${current.x} ${current.y} ${end.x} ${end.y}`;
  }

  const last = points.at(-1)!;
  path += ` L ${last.x} ${last.y}`;
  return path;
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

/**
 * @name lengthAtY
 * @description Binary-searches a path whose `y` never decreases along its
 * length for the smallest length whose sampled point reaches `y`.
 *
 * @example
 * const length = lengthAtY((at) => path.getPointAtLength(at), path.getTotalLength(), 120);
 */
export function lengthAtY(
  sample: (length: number) => Point,
  pathLength: number,
  y: number,
): number {
  if (pathLength <= 0) {
    return 0;
  }

  let low = 0;
  let high = pathLength;

  for (
    let iteration = 0;
    iteration < MAX_SEARCH_ITERATIONS && high - low >= SEARCH_PRECISION;
    iteration += 1
  ) {
    const middle = (low + high) / 2;
    if (sample(middle).y >= y) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return high;
}
