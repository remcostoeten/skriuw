export type Point = readonly [number, number];

type Segment =
  | { kind: "M"; to: Point }
  | { kind: "L"; to: Point }
  | { kind: "C"; c1: Point; c2: Point; to: Point }
  | { kind: "Q"; c: Point; to: Point }
  | {
      kind: "A";
      rx: number;
      ry: number;
      rotation: number;
      large: boolean;
      sweep: boolean;
      to: Point;
    }
  | { kind: "Z" };

const ARGUMENT_COUNT: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};
const TOKEN_PATTERN = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const ARC_FLAG_PATTERN = /[01]/y;

function tokenize(d: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  let command = "";
  let argumentIndex = 0;
  while (index < d.length) {
    const char = d[index]!;
    if (/[\s,]/.test(char)) {
      index += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(char)) {
      tokens.push(char);
      command = char.toLowerCase();
      argumentIndex = 0;
      index += 1;
      continue;
    }
    const slot = argumentIndex % (ARGUMENT_COUNT[command] ?? 1);
    if (command === "a" && (slot === 3 || slot === 4)) {
      ARC_FLAG_PATTERN.lastIndex = index;
      const flag = ARC_FLAG_PATTERN.exec(d);
      if (!flag) throw new Error(`Malformed arc flag at ${index} in "${d}"`);
      tokens.push(flag[0]);
      index += 1;
      argumentIndex += 1;
      continue;
    }
    TOKEN_PATTERN.lastIndex = index;
    const number = TOKEN_PATTERN.exec(d);
    if (!number || number.index !== index)
      throw new Error(`Malformed number at ${index} in "${d}"`);
    tokens.push(number[0]);
    index += number[0].length;
    argumentIndex += 1;
  }
  return tokens;
}

/** Parses SVG path data into absolute segments (H/V become L, S/T become C/Q). */
export function parsePath(d: string): Segment[] {
  const tokens = tokenize(d);
  const segments: Segment[] = [];
  let index = 0;
  let command = "";
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  let lastCubic: Point | undefined;
  let lastQuad: Point | undefined;
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index]!)) {
      command = tokens[index]!;
      index += 1;
    }
    const lower = command.toLowerCase();
    const relative = command !== command.toUpperCase();
    const count = ARGUMENT_COUNT[lower];
    if (count === undefined) throw new Error(`Unsupported path command "${command}"`);
    const args = tokens.slice(index, index + count).map(Number);
    index += count;
    const [ox, oy] = relative ? current : [0, 0];
    function point(x: number, y: number): Point {
      return [ox + x, oy + y];
    }
    let reflectCubic: Point | undefined;
    let reflectQuad: Point | undefined;
    switch (lower) {
      case "m":
        current = point(args[0]!, args[1]!);
        start = current;
        segments.push({ kind: "M", to: current });
        command = relative ? "l" : "L";
        break;
      case "l":
        current = point(args[0]!, args[1]!);
        segments.push({ kind: "L", to: current });
        break;
      case "h":
        current = [relative ? current[0] + args[0]! : args[0]!, current[1]];
        segments.push({ kind: "L", to: current });
        break;
      case "v":
        current = [current[0], relative ? current[1] + args[0]! : args[0]!];
        segments.push({ kind: "L", to: current });
        break;
      case "c": {
        const c2 = point(args[2]!, args[3]!);
        segments.push({
          kind: "C",
          c1: point(args[0]!, args[1]!),
          c2,
          to: point(args[4]!, args[5]!),
        });
        current = point(args[4]!, args[5]!);
        reflectCubic = c2;
        break;
      }
      case "s": {
        const c1: Point = lastCubic
          ? [2 * current[0] - lastCubic[0], 2 * current[1] - lastCubic[1]]
          : current;
        const c2 = point(args[0]!, args[1]!);
        const to = point(args[2]!, args[3]!);
        segments.push({ kind: "C", c1, c2, to });
        current = to;
        reflectCubic = c2;
        break;
      }
      case "q": {
        const c = point(args[0]!, args[1]!);
        const to = point(args[2]!, args[3]!);
        segments.push({ kind: "Q", c, to });
        current = to;
        reflectQuad = c;
        break;
      }
      case "t": {
        const c: Point = lastQuad
          ? [2 * current[0] - lastQuad[0], 2 * current[1] - lastQuad[1]]
          : current;
        const to = point(args[0]!, args[1]!);
        segments.push({ kind: "Q", c, to });
        current = to;
        reflectQuad = c;
        break;
      }
      case "a": {
        const to = point(args[5]!, args[6]!);
        segments.push({
          kind: "A",
          rx: Math.abs(args[0]!),
          ry: Math.abs(args[1]!),
          rotation: args[2]!,
          large: args[3] === 1,
          sweep: args[4] === 1,
          to,
        });
        current = to;
        break;
      }
      case "z":
        segments.push({ kind: "Z" });
        current = start;
        break;
    }
    lastCubic = reflectCubic;
    lastQuad = reflectQuad;
  }
  return segments;
}

function format(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function formatPoint([x, y]: Point): string {
  return `${format(x)} ${format(y)}`;
}

function serialize(segments: readonly Segment[]): string {
  return segments
    .map((segment) => {
      switch (segment.kind) {
        case "M":
          return `M${formatPoint(segment.to)}`;
        case "L":
          return `L${formatPoint(segment.to)}`;
        case "C":
          return `C${formatPoint(segment.c1)} ${formatPoint(segment.c2)} ${formatPoint(segment.to)}`;
        case "Q":
          return `Q${formatPoint(segment.c)} ${formatPoint(segment.to)}`;
        case "A":
          return `A${format(segment.rx)} ${format(segment.ry)} ${format(segment.rotation)} ${segment.large ? 1 : 0} ${segment.sweep ? 1 : 0} ${formatPoint(segment.to)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}

/**
 * Splits path data into self-contained subpaths, each starting with an absolute
 * moveto. A drawing command that follows a close without its own moveto stays
 * with the subpath it continues, which is how the renderer treats it.
 */
export function splitSubpaths(d: string): string[] {
  const groups: Segment[][] = [];
  let lastClosedStart: Point = [0, 0];
  let open: Segment[] | undefined;
  for (const segment of parsePath(d)) {
    if (segment.kind === "M") {
      open = [segment];
      groups.push(open);
      lastClosedStart = segment.to;
      continue;
    }
    if (!open) {
      open = [{ kind: "M", to: lastClosedStart }];
      groups.push(open);
    }
    open.push(segment);
  }
  return groups.map(serialize);
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  return sign * Math.acos(Math.min(1, Math.max(-1, dot)));
}

function arcToCenter(from: Point, segment: Extract<Segment, { kind: "A" }>) {
  const [x1, y1] = from;
  const [x2, y2] = segment.to;
  const phi = (segment.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let { rx, ry } = segment;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor =
    (segment.large === segment.sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const theta = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!segment.sweep && delta > 0) delta -= 2 * Math.PI;
  if (segment.sweep && delta < 0) delta += 2 * Math.PI;
  return { cx, cy, rx, ry, cos, sin, theta, delta };
}

const CURVE_STEPS = 24;

/** Flattens path data into closed polygons, one per subpath. */
export function flattenPath(d: string): Point[][] {
  const polygons: Point[][] = [];
  let polygon: Point[] = [];
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  function flush() {
    if (polygon.length > 1) polygons.push(polygon);
    polygon = [];
  }
  for (const segment of parsePath(d)) {
    switch (segment.kind) {
      case "M":
        flush();
        polygon = [segment.to];
        current = segment.to;
        start = segment.to;
        break;
      case "L":
        if (polygon.length === 0) polygon = [current];
        polygon.push(segment.to);
        current = segment.to;
        break;
      case "C": {
        if (polygon.length === 0) polygon = [current];
        const [x0, y0] = current;
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          const t = step / CURVE_STEPS;
          const u = 1 - t;
          polygon.push([
            u * u * u * x0 +
              3 * u * u * t * segment.c1[0] +
              3 * u * t * t * segment.c2[0] +
              t * t * t * segment.to[0],
            u * u * u * y0 +
              3 * u * u * t * segment.c1[1] +
              3 * u * t * t * segment.c2[1] +
              t * t * t * segment.to[1],
          ]);
        }
        current = segment.to;
        break;
      }
      case "Q": {
        if (polygon.length === 0) polygon = [current];
        const [x0, y0] = current;
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          const t = step / CURVE_STEPS;
          const u = 1 - t;
          polygon.push([
            u * u * x0 + 2 * u * t * segment.c[0] + t * t * segment.to[0],
            u * u * y0 + 2 * u * t * segment.c[1] + t * t * segment.to[1],
          ]);
        }
        current = segment.to;
        break;
      }
      case "A": {
        if (polygon.length === 0) polygon = [current];
        if (segment.rx === 0 || segment.ry === 0) {
          polygon.push(segment.to);
          current = segment.to;
          break;
        }
        const arc = arcToCenter(current, segment);
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          const angle = arc.theta + (arc.delta * step) / CURVE_STEPS;
          const px = arc.rx * Math.cos(angle);
          const py = arc.ry * Math.sin(angle);
          polygon.push([
            arc.cos * px - arc.sin * py + arc.cx,
            arc.sin * px + arc.cos * py + arc.cy,
          ]);
        }
        current = segment.to;
        break;
      }
      case "Z":
        current = start;
        flush();
        polygon = [];
        break;
    }
  }
  flush();
  return polygons;
}

export type FillRule = "nonzero" | "evenodd";

/** Whether a point is painted by the flattened shape under the given fill rule. */
export function containsPoint(
  polygons: readonly Point[][],
  [x, y]: Point,
  rule: FillRule = "nonzero",
): boolean {
  let winding = 0;
  let crossings = 0;
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const [x1, y1] = polygon[index]!;
      const [x2, y2] = polygon[(index + 1) % polygon.length]!;
      if (y1 <= y && y2 > y) {
        if ((x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0) {
          winding += 1;
          crossings += 1;
        }
      } else if (y1 > y && y2 <= y) {
        if ((x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) {
          winding -= 1;
          crossings += 1;
        }
      }
    }
  }
  return rule === "evenodd" ? crossings % 2 === 1 : winding !== 0;
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export function pathBounds(d: string): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const polygon of flattenPath(d)) {
    for (const [x, y] of polygon) {
      box.minX = Math.min(box.minX, x);
      box.minY = Math.min(box.minY, y);
      box.maxX = Math.max(box.maxX, x);
      box.maxY = Math.max(box.maxY, y);
    }
  }
  return box;
}
