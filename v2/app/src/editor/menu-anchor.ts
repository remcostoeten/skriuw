import type { EditorView } from "prosemirror-view";

const MENU_HEIGHT = 32;
const EDGE_GAP = 12;

export type MenuAnchor = {
  x: number;
  y: number;
  below: boolean;
};

/**
 * Viewport anchor for a popover attached to a document range: horizontally
 * centered on the range and above it, flipping below when the range sits too
 * close to the top of the window for the popover to fit.
 *
 * `width` is the popover's maximum width, used only to keep it inside the
 * window; `below` tells the caller which transform to apply.
 */
export function rangeMenuAnchor(
  view: EditorView,
  from: number,
  to: number,
  width: number,
): MenuAnchor {
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  const half = width / 2;
  const sameLine = start.top === end.top;
  const center = sameLine ? (start.left + end.left) / 2 : start.left + half;
  const below = start.top - MENU_HEIGHT - EDGE_GAP < 0;
  return {
    x: Math.max(half + EDGE_GAP, Math.min(center, window.innerWidth - half - EDGE_GAP)),
    y: below ? end.bottom : start.top,
    below,
  };
}
