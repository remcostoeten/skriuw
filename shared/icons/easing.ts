export type CubicBezier = readonly [number, number, number, number];

/**
 * Named curves the motion spec refers to. `out`, `inout`, `spring` and `sine`
 * are the approved design tokens; the rest are the one-off curves individual
 * animations used for a single segment.
 */
export const EASINGS = {
  linear: [0, 0, 1, 1],
  out: [0.22, 1, 0.36, 1],
  inout: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.56, 0.64, 1],
  sine: [0.37, 0, 0.63, 1],
  swing: [0.33, 0, 0.67, 1],
  standard: [0.42, 0, 0.58, 1],
  accelerate: [0.55, 0, 1, 0.45],
  swoop: [0.55, 0, 0.75, 0.2],
} as const satisfies Record<string, CubicBezier>;

export type EasingToken = keyof typeof EASINGS;

export function cssEasing(token: EasingToken): string {
  if (token === "linear") return "linear";
  return `cubic-bezier(${EASINGS[token].join(", ")})`;
}

function curve(a: number, b: number, t: number): number {
  return 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
}

function slope(a: number, b: number, t: number): number {
  return 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;
}

/**
 * Evaluates a CSS cubic-bezier timing function: solves x(t) = progress by
 * Newton iteration with a bisection fallback, then returns y(t).
 */
export function evaluateEasing(token: EasingToken, progress: number): number {
  const [x1, y1, x2, y2] = EASINGS[token];
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  if (token === "linear") return progress;
  let t = progress;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = curve(x1, x2, t) - progress;
    const derivative = slope(x1, x2, t);
    if (Math.abs(error) < 1e-7) return curve(y1, y2, t);
    if (Math.abs(derivative) < 1e-6) break;
    t -= error / derivative;
  }
  let low = 0;
  let high = 1;
  t = progress;
  while (high - low > 1e-7) {
    if (curve(x1, x2, t) < progress) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return curve(y1, y2, t);
}
