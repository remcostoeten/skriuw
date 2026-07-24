export type EditorSearchController = {
  open: () => void;
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
