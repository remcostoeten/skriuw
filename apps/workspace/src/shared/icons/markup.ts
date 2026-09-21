import { selectGlyph, type GlyphName } from "@skriuw/icons";

/**
 * A Fluent glyph as an SVG string, for DOM that is built outside React such as
 * ProseMirror node views. Sized by CSS unless `size` is given.
 */
export function glyphMarkup(glyph: GlyphName, size?: number): string {
  const drawing = selectGlyph(glyph, size ?? 16);
  const dimensions = size === undefined ? "" : ` width="${size}" height="${size}"`;
  return `<svg viewBox="0 0 ${drawing.grid} ${drawing.grid}"${dimensions} fill="currentColor" focusable="false" aria-hidden="true"><path d="${drawing.d}"/></svg>`;
}
