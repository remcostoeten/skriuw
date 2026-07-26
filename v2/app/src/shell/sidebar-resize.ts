import { noop } from "../shared/lib/noop";
import type { PanelResizeBounds } from "./panel-resize-handle";

const STORAGE_KEY = "skriuw:sidebar-width:v1";

export const SIDEBAR_MIN_WIDTH = 152;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_COLLAPSE_WIDTH = 120;

/**
 * Clamps a dragged sidebar width to the resizable range. Widths under the
 * collapse threshold are reported unclamped so the caller can decide to
 * collapse instead of pinning to the minimum.
 */
export function clampSidebarWidth(width: number): number {
  if (width < SIDEBAR_COLLAPSE_WIDTH) {
    return width;
  }
  if (width < SIDEBAR_MIN_WIDTH) {
    return SIDEBAR_MIN_WIDTH;
  }
  return Math.min(width, SIDEBAR_MAX_WIDTH);
}

export function shouldCollapseSidebar(width: number): boolean {
  return width < SIDEBAR_COLLAPSE_WIDTH;
}

export const SIDEBAR_RESIZE_BOUNDS: PanelResizeBounds = {
  minWidth: SIDEBAR_MIN_WIDTH,
  maxWidth: SIDEBAR_MAX_WIDTH,
  clamp: clampSidebarWidth,
  shouldCollapse: shouldCollapseSidebar,
};

/** Reads the persisted sidebar width, falling back to the default. */
export function readSidebarWidth(): number {
  if (typeof window === "undefined") {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  try {
    const raw = Number(window.localStorage.getItem(STORAGE_KEY));
    if (!Number.isFinite(raw) || raw < SIDEBAR_MIN_WIDTH) {
      return SIDEBAR_DEFAULT_WIDTH;
    }
    return Math.min(raw, SIDEBAR_MAX_WIDTH);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

export function writeSidebarWidth(width: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    noop();
  }
}
