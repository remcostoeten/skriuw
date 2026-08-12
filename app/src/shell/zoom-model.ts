export const ZOOM_MIN_PERCENT = 25;
export const ZOOM_MAX_PERCENT = 300;
export const ZOOM_DEFAULT_PERCENT = 100;
export const ZOOM_KEY_STEP_PERCENT = 5;
export const ZOOM_WHEEL_STEP_PERCENT = 2;

export function clampZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return ZOOM_DEFAULT_PERCENT;
  }
  return Math.min(ZOOM_MAX_PERCENT, Math.max(ZOOM_MIN_PERCENT, Math.round(percent)));
}

export function parseStoredZoomPercent(raw: string | null): number {
  if (raw === null) {
    return ZOOM_DEFAULT_PERCENT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? ZOOM_DEFAULT_PERCENT : clampZoomPercent(parsed);
}
