export type RawMarkdownState = {
  noteId: string | null;
  text: string;
  dirty: boolean;
};

export function reconcileRawMarkdown(
  current: RawMarkdownState,
  noteId: string | null,
  markdown: string,
): RawMarkdownState {
  if (current.noteId !== noteId) {
    return { noteId, text: markdown, dirty: false };
  }
  if (current.dirty && current.text !== markdown) {
    return current;
  }
  if (current.text === markdown && !current.dirty) {
    return current;
  }
  return { noteId, text: markdown, dirty: false };
}

export function updateRawMarkdown(
  current: RawMarkdownState,
  text: string,
): RawMarkdownState {
  return { ...current, text, dirty: true };
}
