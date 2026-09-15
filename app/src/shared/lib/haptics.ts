type HapticKind = "select" | "confirm" | "warn";

const PATTERNS: Record<HapticKind, number[]> = {
  select: [8],
  confirm: [14],
  warn: [10, 40, 10],
};

/**
 * A short physical tick for gestures that cross a threshold: a long press that
 * opened a menu, a swipe that will delete on release. No-op where the platform
 * has no vibration API, which includes every iOS browser, so nothing may
 * depend on it having fired.
 */
export function haptic(kind: HapticKind): void {
  const vibrate = typeof navigator !== "undefined" ? navigator.vibrate : undefined;
  if (typeof vibrate !== "function") {
    return;
  }
  try {
    vibrate.call(navigator, PATTERNS[kind]);
  } catch {
    return;
  }
}
