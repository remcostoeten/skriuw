import {
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  type DrawingShapeKind,
  type DrawingTool,
} from "@/features/editor/drawing-layer";

/** Every tool the annotate toolbar offers, including the non-inking ones. */
export type DrawingToolId = DrawingTool | DrawingShapeKind | "eraser" | "select";

export type DrawingInk = {
  id: string;
  label: string;
  /** Digit that selects this ink while annotating. */
  key: string;
  light: string;
  dark: string;
};

/**
 * Theme-aware ink pairs. A stroke stores the preset id, so the same ink resolves
 * to a readable value in either theme instead of freezing the hex it was drawn
 * with — see ADR-0035.
 */
export const DRAWING_INKS: readonly DrawingInk[] = [
  { id: "ink", label: "Ink", key: "1", light: "#1e1e1e", dark: "#e9ecef" },
  { id: "red", label: "Red", key: "2", light: "#e03131", dark: "#ff8787" },
  { id: "orange", label: "Orange", key: "3", light: "#e8590c", dark: "#ffa94d" },
  { id: "yellow", label: "Yellow", key: "4", light: "#f08c00", dark: "#ffd43b" },
  { id: "green", label: "Green", key: "5", light: "#2f9e44", dark: "#69db7c" },
  { id: "teal", label: "Teal", key: "6", light: "#0c8599", dark: "#38d9a9" },
  { id: "blue", label: "Blue", key: "7", light: "#1971c2", dark: "#74c0fc" },
  { id: "violet", label: "Violet", key: "8", light: "#9c36b5", dark: "#da77f2" },
];

/** Stops the bracket keys step through; the wheel moves continuously. */
export const PEN_WIDTH_STOPS: readonly number[] = [1, 2, 4, 8, 16];
export const HIGHLIGHTER_WIDTH_STOPS: readonly number[] = [12, 18, 28, 44, 64];

export const HIGHLIGHTER_OPACITY = 0.35;

export type DrawingBrush = {
  tool: DrawingToolId;
  /** A preset ink id, or a `#rrggbb` literal for a custom color. */
  colorId: string;
  penWidth: number;
  highlighterWidth: number;
  /** Rectangles and ellipses only. */
  filled: boolean;
};

export const DEFAULT_BRUSH: DrawingBrush = {
  tool: "pen",
  colorId: "ink",
  penWidth: 2,
  highlighterWidth: 18,
  filled: false,
};

/** Tools that lay down ink, and so care about color and width. */
export function isInkingTool(tool: DrawingToolId): boolean {
  return tool !== "eraser" && tool !== "select";
}

export function isShapeTool(tool: DrawingToolId): tool is DrawingShapeKind {
  return tool === "line" || tool === "rect" || tool === "ellipse";
}

export function drawingInk(colorId: string): DrawingInk | null {
  return DRAWING_INKS.find((ink) => ink.id === colorId) ?? null;
}

/**
 * The value a stored color paints as. A preset resolves against the theme; a
 * literal was chosen by the reader and is used as written.
 */
export function resolveInk(colorId: string, dark: boolean): string {
  const preset = drawingInk(colorId);
  if (!preset) return colorId;
  return dark ? preset.dark : preset.light;
}

export function inkLabel(colorId: string): string {
  return drawingInk(colorId)?.label ?? colorId;
}

export function clampStrokeWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_BRUSH.penWidth;
  return Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, Math.round(width * 10) / 10));
}

/** The width the current tool draws with. */
export function brushWidth(brush: DrawingBrush): number {
  return brush.tool === "highlighter" ? brush.highlighterWidth : brush.penWidth;
}

export function brushOpacity(brush: DrawingBrush): number {
  return brush.tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1;
}

export function withBrushWidth(brush: DrawingBrush, width: number): DrawingBrush {
  const clamped = clampStrokeWidth(width);
  return brush.tool === "highlighter"
    ? { ...brush, highlighterWidth: clamped }
    : { ...brush, penWidth: clamped };
}

/**
 * Moves to the next preset stop past the current width, so stepping out of a
 * wheel-chosen width lands on a stop instead of jumping back to where the
 * stops happen to sit.
 */
export function stepBrushWidth(brush: DrawingBrush, direction: 1 | -1): DrawingBrush {
  const stops = brush.tool === "highlighter" ? HIGHLIGHTER_WIDTH_STOPS : PEN_WIDTH_STOPS;
  const current = brushWidth(brush);
  const next =
    direction === 1
      ? stops.find((stop) => stop > current)
      : [...stops].reverse().find((stop) => stop < current);
  return withBrushWidth(brush, next ?? current);
}

/**
 * Reads an `H S% L%` triplet — the shape every theme declares `--background`
 * with — and reports whether the surface is dark. Deriving it from the resolved
 * variable keeps ink legible in any theme without a per-theme table to maintain.
 */
export function isDarkBackground(background: string): boolean {
  const lightness = Number.parseFloat(background.trim().split(/\s+/)[2] ?? "");
  return Number.isFinite(lightness) ? lightness < 50 : true;
}
