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
