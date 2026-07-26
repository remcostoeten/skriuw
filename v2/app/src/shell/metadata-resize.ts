import { noop } from "../shared/lib/noop";
import type { PanelResizeBounds } from "./panel-resize-handle";

const STORAGE_KEY = "skriuw:metadata-width:v1";

export const METADATA_MIN_WIDTH = 180;
export const METADATA_MAX_WIDTH = 480;
export const METADATA_DEFAULT_WIDTH = 240;
export const METADATA_COLLAPSE_WIDTH = 140;

/**
 * Clamps a dragged metadata panel width to the resizable range. Widths under
 * the collapse threshold are reported unclamped so the caller can decide to
 * collapse instead of pinning to the minimum.
 */
export function clampMetadataWidth(width: number): number {
  if (width < METADATA_COLLAPSE_WIDTH) {
    return width;
  }
  if (width < METADATA_MIN_WIDTH) {
    return METADATA_MIN_WIDTH;
  }
  return Math.min(width, METADATA_MAX_WIDTH);
}

export function shouldCollapseMetadata(width: number): boolean {
  return width < METADATA_COLLAPSE_WIDTH;
}

export const METADATA_RESIZE_BOUNDS: PanelResizeBounds = {
  minWidth: METADATA_MIN_WIDTH,
  maxWidth: METADATA_MAX_WIDTH,
  clamp: clampMetadataWidth,
  shouldCollapse: shouldCollapseMetadata,
};

/** Reads the persisted metadata panel width, falling back to the default. */
export function readMetadataWidth(): number {
  if (typeof window === "undefined") {
    return METADATA_DEFAULT_WIDTH;
  }
  try {
    const raw = Number(window.localStorage.getItem(STORAGE_KEY));
    if (!Number.isFinite(raw) || raw < METADATA_MIN_WIDTH) {
      return METADATA_DEFAULT_WIDTH;
    }
    return Math.min(raw, METADATA_MAX_WIDTH);
  } catch {
    return METADATA_DEFAULT_WIDTH;
  }
}

export function writeMetadataWidth(width: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    noop();
  }
}
