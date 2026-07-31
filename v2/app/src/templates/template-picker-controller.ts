export type TemplatePickerRequest = {
  parentId: string | null;
};

type TemplatePickerListener = (request: TemplatePickerRequest) => void;

let listener: TemplatePickerListener | null = null;
let pending: TemplatePickerRequest | null = null;

export function registerTemplatePicker(next: TemplatePickerListener): () => void {
  listener = next;
  if (pending !== null) {
    const request = pending;
    pending = null;
    next(request);
  }
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * Opens the template picker targeting `parentId`. When the host is not mounted
 * yet (e.g. the palette navigated to the notes route this frame), the request
 * is queued and replayed once {@link registerTemplatePicker} runs.
 */
export function requestTemplatePicker(parentId: string | null): void {
  if (listener) {
    listener({ parentId });
  } else {
    pending = { parentId };
  }
}
