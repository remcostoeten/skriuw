/**
 * A run of snippet text. `matched` marks the spans SQLite's `snippet()` wrapped
 * in `<mark>` because the query matched there.
 */
export type SnippetSegment = {
  text: string;
  matched: boolean;
};

const OPEN = "<mark>";
const CLOSE = "</mark>";

/**
 * Splits a stored snippet into plain and matched runs.
 *
 * Storage projects notes through `index_text` before indexing, so the only
 * `<mark>` in a snippet is the delimiter FTS5 itself inserted; a stray or
 * unbalanced one is treated as ordinary text rather than a formatting hole.
 */
export function snippetSegments(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  let rest = snippet;
  while (rest.length > 0) {
    const open = rest.indexOf(OPEN);
    if (open === -1) {
      break;
    }
    const close = rest.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) {
      break;
    }
    if (open > 0) {
      segments.push({ text: rest.slice(0, open), matched: false });
    }
    segments.push({ text: rest.slice(open + OPEN.length, close), matched: true });
    rest = rest.slice(close + CLOSE.length);
  }
  if (rest.length > 0) {
    segments.push({ text: rest, matched: false });
  }
  return segments;
}

/** The snippet with its match delimiters removed, for matching and scoring. */
export function snippetPlainText(snippet: string): string {
  return snippetSegments(snippet)
    .map((segment) => segment.text)
    .join("");
}
