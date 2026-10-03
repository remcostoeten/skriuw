const GHOST_CLICK_WINDOW_MS = 350;
const COMPAT_EVENTS = ["mousedown", "mouseup", "click"] as const;

/**
 * Swallows the mouse events a touch synthesises after the element it landed
 * on has gone. A menu item selected by touch unmounts the menu on pointerup,
 * and the browser then delivers the tap's mousedown and click to whatever sits
 * underneath: a tree row, a scrim, a tab. The mousedown alone would move focus
 * off a field the selection just opened. Call this as the menu closes; the
 * window is short so a real second tap still lands.
 */
export function swallowGhostClick(): void {
  if (typeof document === "undefined") {
    return;
  }
  function swallow(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "click") {
      dispose();
    }
  }
  const timer = window.setTimeout(dispose, GHOST_CLICK_WINDOW_MS);
  function dispose(): void {
    window.clearTimeout(timer);
    for (const type of COMPAT_EVENTS) {
      document.removeEventListener(type, swallow, true);
    }
  }
  for (const type of COMPAT_EVENTS) {
    document.addEventListener(type, swallow, true);
  }
}
