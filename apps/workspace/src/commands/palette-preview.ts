export type PreviewLineTone = "heading" | "text" | "item";

export type PreviewLine = {
  text: string;
  tone: PreviewLineTone;
};

export type PalettePreview = {
  title: string;
  meta: readonly string[];
  lines: readonly PreviewLine[];
  placeholder: string | null;
  chips: readonly string[];
};

const EXCERPT_SCAN_LIMIT = 4000;
const LINE_LENGTH_LIMIT = 160;

function plainInline(text: string): string {
  return (
    text
      // Images, `![alt](src)`, carry nothing readable in an excerpt.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // Links, `[label](href)`, keep their label.
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Wiki links, `[[target|label]]` or `[[target]]`, keep the visible part.
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
      // Emphasis and inline code markers: `**`, `__`, `*`, `_`, `~~`, backticks.
      .replace(/(\*\*|__|~~|`)/g, "")
      .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$)/g, "$1$2")
      .trim()
  );
}

function previewLine(source: string): PreviewLine | null {
  // ATX heading: one to six hashes, a space, then the heading text.
  const heading = source.match(/^#{1,6}\s+(.*)$/);
  if (heading) {
    const text = plainInline(heading[1] ?? "");
    return text ? { text, tone: "heading" } : null;
  }
  // List item: a bullet or `1.` marker with an optional `[ ]` task box.
  const item = source.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
  if (item) {
    const text = plainInline(item[1] ?? "");
    return text ? { text, tone: "item" } : null;
  }
  // Blockquote markers, `>` possibly nested, are dropped.
  const text = plainInline(source.replace(/^(?:>\s*)+/, ""));
  return text ? { text, tone: "text" } : null;
}

/**
 * @name notePreviewLines
 * @description Reduces a note's Markdown to the first few readable lines for
 * the palette preview: front matter, fences, rules and inline markup are
 * dropped, headings and list items keep their role.
 * @example notePreviewLines("# Plan\n\n- ship it") // heading "Plan", item "ship it"
 */
export function notePreviewLines(markdown: string, max: number = 14): PreviewLine[] {
  const lines = markdown.slice(0, EXCERPT_SCAN_LIMIT).split("\n");
  const preview: PreviewLine[] = [];
  let inFrontMatter = lines[0]?.trim() === "---";
  for (const [index, raw] of lines.entries()) {
    if (preview.length >= max) {
      break;
    }
    const source = raw.trim();
    if (inFrontMatter) {
      inFrontMatter = index === 0 || source !== "---";
      continue;
    }
    // Code fences and horizontal rules are structure, not content.
    if (source === "" || /^(?:```|~~~|-{3,}$|\*{3,}$)/.test(source)) {
      continue;
    }
    const line = previewLine(source);
    if (line) {
      preview.push({ ...line, text: line.text.slice(0, LINE_LENGTH_LIMIT) });
    }
  }
  return preview;
}
