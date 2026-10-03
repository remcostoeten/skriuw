export type Point = { x: number; y: number };

/**
 * @name roundedPath
 * @description Builds an SVG path through the points with every inner corner
 * rounded by a quadratic curve. The radius shrinks to half of the shorter
 * adjacent segment so short segments never overshoot.
 *
 * @example
 * roundedPath([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 10, y: 20 }], 6);
 */
export function roundedPath(points: Point[], radius: number) {
  const [first] = points;

  if (!first || points.length < 2) {
    return "";
  }

  let path = `M ${first.x} ${first.y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];

    if (!previous || !current || !next) {
      continue;
    }

    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const localRadius = Math.min(radius, incoming / 2, outgoing / 2);
    const startRatio = incoming ? localRadius / incoming : 0;
    const endRatio = outgoing ? localRadius / outgoing : 0;
    const startX = current.x + (previous.x - current.x) * startRatio;
    const startY = current.y + (previous.y - current.y) * startRatio;
    const endX = current.x + (next.x - current.x) * endRatio;
    const endY = current.y + (next.y - current.y) * endRatio;

    path += ` L ${startX} ${startY} Q ${current.x} ${current.y} ${endX} ${endY}`;
  }

  const last = points.at(-1) ?? first;

  return `${path} L ${last.x} ${last.y}`;
}
