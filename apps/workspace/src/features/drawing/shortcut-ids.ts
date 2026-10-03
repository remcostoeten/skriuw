import type { ShortcutActionId } from "@/commands/definitions";

export const DRAWING_SHORTCUT_IDS = [
  "drawPen",
  "drawHighlighter",
  "drawLine",
  "drawRectangle",
  "drawEllipse",
  "drawToggleFill",
  "drawEraser",
  "drawSelect",
  "drawWidthDecrease",
  "drawWidthIncrease",
  "drawInkDefault",
  "drawInkRed",
  "drawInkOrange",
  "drawInkYellow",
  "drawInkGreen",
  "drawInkTeal",
  "drawInkBlue",
  "drawInkViolet",
] as const satisfies readonly ShortcutActionId[];

export type DrawingShortcutId = (typeof DRAWING_SHORTCUT_IDS)[number];
