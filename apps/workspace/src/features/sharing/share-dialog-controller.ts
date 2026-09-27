type ShareDialogListener = (noteId: string) => void;

let listener: ShareDialogListener | null = null;

export function registerNoteShareDialog(next: ShareDialogListener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

/** Opens the share dialog for `noteId`; a no-op before the host mounts. */
export function requestNoteShare(noteId: string): void {
  listener?.(noteId);
}
