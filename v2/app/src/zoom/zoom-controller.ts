import { getCurrentWebview } from "@tauri-apps/api/webview";
import { hasTauriRuntime } from "../bridge/external-links";
import {
  ZOOM_DEFAULT_PERCENT,
  ZOOM_KEY_STEP_PERCENT,
  ZOOM_WHEEL_STEP_PERCENT,
  clampZoomPercent,
  parseStoredZoomPercent,
} from "./zoom-model";

const STORAGE_KEY = "skriuw:zoom-percent";
const PERSIST_DELAY_MS = 400;

let zoomPercent = ZOOM_DEFAULT_PERCENT;
let nativeZoomUnavailable = false;
let applyFrame: number | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function applyCssZoom(factor: number): void {
  document.documentElement.style.setProperty("zoom", String(factor));
}

function applyZoomNow(): void {
  const factor = zoomPercent / 100;
  if (nativeZoomUnavailable || !hasTauriRuntime()) {
    applyCssZoom(factor);
    return;
  }
  getCurrentWebview()
    .setZoom(factor)
    .catch(() => {
      nativeZoomUnavailable = true;
      applyCssZoom(factor);
    });
}

/**
 * Coalesces bursts of zoom changes (key repeat, trackpad wheel streams) into
 * at most one webview IPC call per animation frame.
 */
function scheduleApply(): void {
  if (applyFrame !== null) {
    return;
  }
  applyFrame = requestAnimationFrame(() => {
    applyFrame = null;
    applyZoomNow();
  });
}

function schedulePersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, String(zoomPercent));
    } catch (error) {
      console.error("zoom persistence failed", error);
    }
  }, PERSIST_DELAY_MS);
}

export function currentZoomPercent(): number {
  return zoomPercent;
}

export function setZoomPercent(next: number): void {
  const clamped = clampZoomPercent(next);
  if (clamped === zoomPercent) {
    return;
  }
  zoomPercent = clamped;
  scheduleApply();
  schedulePersist();
}

export function zoomIn(): void {
  setZoomPercent(zoomPercent + ZOOM_KEY_STEP_PERCENT);
}

export function zoomOut(): void {
  setZoomPercent(zoomPercent - ZOOM_KEY_STEP_PERCENT);
}

export function resetZoom(): void {
  setZoomPercent(ZOOM_DEFAULT_PERCENT);
}

/**
 * Restores the persisted zoom level and binds ctrl+wheel (also emitted by
 * pinch gestures) to 2% zoom steps. Returns an unbind for page teardown.
 */
export function initZoom(): () => void {
  zoomPercent = parseStoredZoomPercent(localStorage.getItem(STORAGE_KEY));
  if (zoomPercent !== ZOOM_DEFAULT_PERCENT) {
    applyZoomNow();
  }
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    if (event.deltaY === 0) {
      return;
    }
    const step = event.deltaY < 0 ? ZOOM_WHEEL_STEP_PERCENT : -ZOOM_WHEEL_STEP_PERCENT;
    setZoomPercent(zoomPercent + step);
  };
  window.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    window.removeEventListener("wheel", onWheel);
  };
}
