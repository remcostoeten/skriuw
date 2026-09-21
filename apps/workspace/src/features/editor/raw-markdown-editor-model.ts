export type RawMarkdownCursorStatus = {
  line: number;
  column: number;
  selectedCharacters: number;
  selectedWords: number;
};

function clampOffset(value: number, textLength: number): number {
  return Math.min(Math.max(value, 0), textLength);
}

export function countRawMarkdownWords(markdown: string): number {
  return markdown.match(/\S+/g)?.length ?? 0;
}

export function rawMarkdownLineCount(markdown: string): number {
  return markdown.split("\n").length;
}

/**
 * The line number a jump-to-line entry asks for, clamped into the document, or
 * null when the entry is not a usable line number so the panel can stay open.
 */
export function parseJumpToLineInput(value: string, lineCount: number): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const line = Number(trimmed);
  if (line < 1) {
    return null;
  }
  return Math.min(line, Math.max(lineCount, 1));
}

export function rawMarkdownCursorStatus(
  markdown: string,
  selectionStart: number,
  selectionEnd: number,
): RawMarkdownCursorStatus {
  const start = clampOffset(selectionStart, markdown.length);
  const end = clampOffset(Math.max(selectionEnd, start), markdown.length);
  let line = 1;
  let column = 1;

  for (let index = 0; index < start; index += 1) {
    if (markdown[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  const selectedText = markdown.slice(start, end);
  return {
    line,
    column,
    selectedCharacters: Array.from(selectedText).length,
    selectedWords: countRawMarkdownWords(selectedText),
  };
}

/** Where every source line starts in the numbering of wrapped screen rows. */
export type RawMarkdownRowLayout = {
  /** One-based number of the first row of each source line. */
  starts: readonly number[];
  /** How many rows each source line wraps into. */
  counts: readonly number[];
  /** Rows in the whole document, never below one. */
  total: number;
};

export type RawMarkdownRowPosition = {
  lineIndex: number;
  rowIndex: number;
};

/** Rows a line block occupies given its measured height and one row's height. */
export function rowsForHeight(blockHeight: number, rowHeight: number): number {
  if (!(rowHeight > 0) || !(blockHeight > 0)) {
    return 1;
  }
  return Math.max(1, Math.round(blockHeight / rowHeight));
}

export function buildRowLayout(counts: readonly number[]): RawMarkdownRowLayout {
  const starts: number[] = [];
  let next = 1;
  for (const count of counts) {
    starts.push(next);
    next += Math.max(1, count);
  }
  return { starts, counts, total: Math.max(1, next - 1) };
}

/** The document-wide row number of a row inside a source line, clamped into that line. */
export function rowNumberAt(layout: RawMarkdownRowLayout, lineIndex: number, rowIndex: number): number {
  const start = layout.starts[lineIndex] ?? layout.total;
  const count = layout.counts[lineIndex] ?? 1;
  return start + Math.min(Math.max(rowIndex, 0), count - 1);
}

/** The source line and the row inside it that a document-wide row number names, clamped into the document. */
export function locateRow(layout: RawMarkdownRowLayout, row: number): RawMarkdownRowPosition {
  const target = Math.min(Math.max(Math.floor(row), 1), layout.total);
  let low = 0;
  let high = layout.starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((layout.starts[middle] ?? Number.POSITIVE_INFINITY) <= target) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return { lineIndex: low, rowIndex: target - (layout.starts[low] ?? 1) };
}
