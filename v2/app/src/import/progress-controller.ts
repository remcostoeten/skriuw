export type ImportProgress = {
  phase: "reading" | "parsing" | "images" | "committing";
  completed: number;
  total: number | null;
  cancellable: boolean;
};

type ActiveProgress = ImportProgress & {
  cancel: () => void;
};

type Listener = (progress: ActiveProgress | null) => void;

let listener: Listener | null = null;

export function registerImportProgressListener(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

export function beginImportProgress(initial: ImportProgress): {
  signal: AbortSignal;
  update: (progress: ImportProgress) => void;
  finish: () => void;
} {
  const controller = new AbortController();
  const publish = (progress: ImportProgress | null) => {
    listener?.(
      progress
        ? { ...progress, cancel: () => controller.abort() }
        : null,
    );
  };
  publish(initial);
  return {
    signal: controller.signal,
    update: publish,
    finish: () => publish(null),
  };
}

export function throwIfImportCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Import cancelled", "AbortError");
  }
}
