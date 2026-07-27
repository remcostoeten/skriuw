export type EditorSearchController = {
  open: () => void;
  openReplace: () => void;
};

let controller: EditorSearchController | null = null;

export function registerEditorSearchController(next: EditorSearchController): () => void {
  controller = next;
  return () => {
    if (controller === next) {
      controller = null;
    }
  };
}

export function openEditorSearch(): void {
  controller?.open();
}

/**
 * Opens the same panel as `openEditorSearch` with the replace row expanded.
 * Never closes an open panel — a find-only panel expands in place.
 */
export function openEditorSearchAndReplace(): void {
  controller?.openReplace();
}
