/**
 * Escapes the five HTML-significant characters so a string can be placed in
 * element text or a quoted attribute value.
 *
 * @param value - The raw text.
 * @returns The text with `&`, `<`, `>`, `"` and `'` replaced by entities.
 *
 * @example
 * ```ts
 * import { escapeHtml } from "@skriuw/shared/helpers/escape-html";
 *
 * const html = `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
 * ```
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
