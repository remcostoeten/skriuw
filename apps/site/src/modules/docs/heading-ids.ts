export type DocHeading = {
  id: string;
  text: string;
  depth: 2 | 3;
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * @name headingText
 * @description Turns rendered inline heading HTML into the plain text a reader
 * sees, removing tags and decoding the entities `escapeHtml` and marked emit.
 * The result is plain text, so React or `escapeHtml` must escape it again.
 *
 * @example
 * headingText("Ship &amp; <em>tell</em>"); // "Ship & tell"
 */
export function headingText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .trim();
}

/**
 * @name slugifyHeading
 * @description Builds a URL fragment from plain heading text. Accents are
 * folded (`geërfde` becomes `geerfde`), letters and digits of any script are
 * kept, and everything else collapses to single hyphens. Text without letters
 * or digits falls back to `section`.
 *
 * @example
 * slugifyHeading("Wat is geërfde schuld?"); // "wat-is-geerfde-schuld"
 */
export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section";
}

/**
 * @name createHeadingIds
 * @description Returns an id generator for one rendered page. The first
 * heading with a given slug keeps it, later ones get `-2`, `-3` and so on so
 * every anchor on the page stays unique.
 *
 * @example
 * const nextId = createHeadingIds();
 * nextId("Notes"); // "notes"
 * nextId("Notes"); // "notes-2"
 */
export function createHeadingIds(): (text: string) => string {
  const used = new Set<string>();
  const counts = new Map<string, number>();

  return (text) => {
    const base = slugifyHeading(text);
    let count = counts.get(base) ?? 0;
    let id = base;

    while (used.has(id)) {
      count += 1;
      id = `${base}-${count + 1}`;
    }

    counts.set(base, count);
    used.add(id);

    return id;
  };
}
