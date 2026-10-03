export const AI_MENU_OFFSET = 10;
export const AI_MENU_EDGE_GAP = 12;

export type Box = { top: number; bottom: number; left: number; right: number };

export type AiMenuGeometry = {
  /** Caret box at the start of the range. */
  start: Box;
  /** Caret box at the end of the range. */
  end: Box;
  /** The editor's text column. */
  column: Box;
  /** The part of the editor pane that is on screen. */
  bounds: Box;
  viewport: Box;
};

export type AiMenuPlacement = {
  left: number;
  top: number;
  /** Height the menu may grow into without covering the range. */
  room: number;
  below: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return max < min ? min : Math.max(min, Math.min(value, max));
}

/**
 * @name placeAiMenu
 * @description Places the AI menu next to its range while keeping it inside the
 * visible editor pane. A range scrolled out of view pins the menu to the nearest
 * pane edge, and without a single-line selection it centers on the text column.
 * `naturalHeight` decides the side so the choice does not depend on the rendered
 * height, which itself depends on the room this returns.
 * @example
 * placeAiMenu(geometry, true, { width: 380, height: 320 }, 520);
 */
export function placeAiMenu(
  geometry: AiMenuGeometry,
  hasSelection: boolean,
  size: { width: number; height: number },
  naturalHeight: number,
): AiMenuPlacement {
  const { start, end, column, bounds, viewport } = geometry;
  const gap = AI_MENU_EDGE_GAP;

  const onOneLine = hasSelection && start.top === end.top;
  const center = onOneLine ? (start.left + end.left) / 2 : (column.left + column.right) / 2;
  const inPane = clamp(center - size.width / 2, bounds.left + gap, bounds.right - gap - size.width);
  const left = clamp(inPane, viewport.left + gap, viewport.right - gap - size.width);

  const spaceAbove = start.top - bounds.top - AI_MENU_OFFSET - gap;
  const spaceBelow = bounds.bottom - end.bottom - AI_MENU_OFFSET - gap;
  const below = spaceAbove < naturalHeight && spaceBelow > spaceAbove;
  const preferred = below ? end.bottom + AI_MENU_OFFSET : start.top - AI_MENU_OFFSET - size.height;
  const top = clamp(preferred, bounds.top + gap, bounds.bottom - gap - size.height);

  const rangeVisible = start.top >= bounds.top && end.bottom <= bounds.bottom;
  const full = bounds.bottom - bounds.top - gap * 2;
  const room = rangeVisible ? Math.max(0, below ? spaceBelow : spaceAbove) : Math.max(0, full);

  return { left, top, room, below };
}
