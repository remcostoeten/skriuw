export const PULL_CLOSE_PX = 96;

/** Downward travel the dialog shows while pulled; a pull upward stays put. */
export function pullOffset(dy: number): number {
  return Math.max(0, dy);
}

export function pullCloses(dy: number): boolean {
  return pullOffset(dy) >= PULL_CLOSE_PX;
}
