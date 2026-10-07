export type OpenedFileConflictChoice = "note" | "file" | "both";

export type OpenedFileConflictRequest = {
  noteTitle: string;
  filePath: string;
  resolve: (choice: OpenedFileConflictChoice | null) => void;
};

type Listener = (request: OpenedFileConflictRequest) => void;

const pending: OpenedFileConflictRequest[] = [];
let listener: Listener | null = null;

function showNext(): void {
  const next = pending[0];
  if (listener && next) {
    listener(next);
  }
}

export function registerOpenedFileConflictListener(next: Listener): () => void {
  listener = next;
  showNext();
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * @name requestOpenedFileConflictChoice
 * @description Asks what to do when a file opened from the file manager and
 * the note it became both changed since they last matched: keep the note,
 * take the file, or keep both. Requests wait until the dialog host mounts and
 * are shown one at a time. Resolves null when the dialog is dismissed.
 *
 * @example
 * const choice = await requestOpenedFileConflictChoice("Todo", "/home/me/todo.md");
 */
export function requestOpenedFileConflictChoice(
  noteTitle: string,
  filePath: string,
): Promise<OpenedFileConflictChoice | null> {
  return new Promise((resolve) => {
    const request: OpenedFileConflictRequest = {
      noteTitle,
      filePath,
      resolve: (choice) => {
        pending.splice(pending.indexOf(request), 1);
        resolve(choice);
        showNext();
      },
    };
    pending.push(request);
    if (pending.length === 1) {
      showNext();
    }
  });
}
