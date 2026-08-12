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

export function rawMarkdownLineNumbers(lineCount: number): string {
  return Array.from({ length: Math.max(lineCount, 1) }, (_, index) => String(index + 1)).join("\n");
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

/** Caret offset of the first character of a one-based line. */
export function rawMarkdownLineOffset(markdown: string, line: number): number {
  const target = Math.max(1, Math.floor(line));
  let offset = 0;
  for (let current = 1; current < target; current += 1) {
    const next = markdown.indexOf("\n", offset);
    if (next === -1) {
      return markdown.length;
    }
    offset = next + 1;
  }
  return Math.min(offset, markdown.length);
}

/**
 * Scroll offset that centers a one-based line in the viewport. Raw Markdown
 * renders with `wrap="off"`, so every line is exactly one row tall and row
 * height is the scroll height divided by the line count.
 */
export function rawMarkdownLineScrollTop(
  line: number,
  lineCount: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const rowHeight = scrollHeight / Math.max(lineCount, 1);
  const centered = (line - 1) * rowHeight - clientHeight / 2 + rowHeight / 2;
  return Math.max(0, Math.min(centered, Math.max(0, scrollHeight - clientHeight)));
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
