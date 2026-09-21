import type { GlyphGrid, GlyphName } from "./catalog";
import { GLYPHS } from "./generated/glyphs";

export type SelectedGlyph = { readonly grid: GlyphGrid; readonly d: string };

/**
 * Fluent draws most glyphs twice: a 20-unit drawing tuned for 16–20px and the
 * 24-unit reference. Small renders take the 20-unit drawing when there is one;
 * `grid` pins a drawing, which animated icons do so their parts line up.
 */
export function selectGlyph(name: GlyphName, size: number, grid?: GlyphGrid): SelectedGlyph {
  const drawings = GLYPHS[name];
  const preferred: GlyphGrid = grid ?? (size <= 20 ? 20 : 24);
  const d = drawings[preferred];
  if (d !== undefined) return { grid: preferred, d };
  const fallback: GlyphGrid = preferred === 20 ? 24 : 20;
  return { grid: fallback, d: drawings[fallback]! };
}
