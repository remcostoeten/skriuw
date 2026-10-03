import type { AppRoute } from "@skriuw/renderer-core/route/app-route";
import { noop } from "@skriuw/shared/helpers/noop";

const STORAGE_KEY = "skriuw:focus-mode:v1";

export type FocusEscapeEvent = {
  key: string;
  defaultPrevented: boolean;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

/**
 * @name readFocusMode
 * @description Reads whether focus mode was on when the window last closed.
 * Focus mode is device layout like the panel widths, so it lives in local
 * storage rather than in the synced workspace settings.
 *
 * @example
 * const [focusMode, setFocusMode] = useState(readFocusMode);
 */
export function readFocusMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * @name writeFocusMode
 * @description Persists the focus mode flag for the next launch. Storage
 * failures leave the current session unaffected.
 *
 * @example
 * writeFocusMode(true);
 */
export function writeFocusMode(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (enabled) {
      window.localStorage.setItem(STORAGE_KEY, "on");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    noop();
  }
}

/**
 * @name focusModeActive
 * @description Whether the shell hides its chrome. Focus mode is about the
 * open note, so only the notes route honours the stored flag.
 *
 * @example
 * const hidesChrome = focusModeActive(focusMode, route);
 */
export function focusModeActive(enabled: boolean, route: AppRoute): boolean {
  return enabled && route === "notes";
}

/**
 * @name escapeExitsFocusMode
 * @description Whether a keypress that reached the window should leave focus
 * mode. Anything that already handled Escape (a menu, the search widget, the
 * editor) keeps it, and so does Vim, where Escape means back to normal mode.
 *
 * @example
 * if (escapeExitsFocusMode(event, usesVimMode(settings), overlayOpen)) exit();
 */
export function escapeExitsFocusMode(
  event: FocusEscapeEvent,
  vimMode: boolean,
  overlayOpen: boolean,
): boolean {
  return (
    event.key === "Escape" &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !vimMode &&
    !overlayOpen
  );
}

/**
 * @name focusModeAnnouncement
 * @description The status message read out when focus mode changes.
 *
 * @example
 * setAnnouncement(focusModeAnnouncement(true));
 */
export function focusModeAnnouncement(enabled: boolean): string {
  return enabled ? "Focus mode on" : "Focus mode off";
}
