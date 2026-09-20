/* Copy of app/src/features/search/snippet.ts, held identical by __tests__/desktop-parity.test.cts. */

export type SnippetSegment = {
  text: string;
  matched: boolean;
};

const OPEN = "<mark>";
const CLOSE = "</mark>";

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

export function snippetPlainText(snippet: string): string {
  return snippetSegments(snippet)
    .map((segment) => segment.text)
    .join("");
}
