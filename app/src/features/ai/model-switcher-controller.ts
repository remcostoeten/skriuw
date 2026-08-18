type ModelSwitcherListener = () => void;

let listener: ModelSwitcherListener | null = null;
let pending = false;

export function registerModelSwitcher(next: ModelSwitcherListener): () => void {
  listener = next;
  if (pending) {
    pending = false;
    next();
  }
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * Opens the AI model switcher. When the host is not mounted yet, the request
 * is queued and replayed once {@link registerModelSwitcher} runs.
 */
export function requestModelSwitcher(): void {
  if (listener) {
    listener();
  } else {
    pending = true;
  }
}
