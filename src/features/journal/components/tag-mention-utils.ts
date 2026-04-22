export type ActiveTagMention = {
  query: string;
  start: number;
};

export function findActiveTagMention(
  content: string,
  cursorPosition: number,
): ActiveTagMention | null {
  const textBeforeCursor = content.slice(0, cursorPosition);
  const match = textBeforeCursor.match(/(?:^|\s)@([^\s@]*)$/);

  if (!match) {
    return null;
  }

  const start = cursorPosition - match[0].length + (match[0].startsWith(" ") ? 1 : 0);

  return {
    query: match[1] ?? "",
    start,
  };
}

export function replaceActiveTagMention(
  content: string,
  mentionStart: number,
  cursorPosition: number,
  tagName: string,
): { content: string; cursorPosition: number } {
  const before = content.slice(0, mentionStart);
  const after = content.slice(cursorPosition);
  const nextContent = `${before}@${tagName} ${after}`;
  const nextCursorPosition = mentionStart + tagName.length + 2;

  return {
    content: nextContent,
    cursorPosition: nextCursorPosition,
  };
}
