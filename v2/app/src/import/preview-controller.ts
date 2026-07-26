import type { ImportPreviewCandidate } from "./preview";

export type ImportPreviewRequest = {
  sourcePath: string;
  candidates: readonly ImportPreviewCandidate[];
  detectedSourceId: string;
};

type PendingPreview = ImportPreviewRequest & {
  resolve: (sourceId: string | null) => void;
};

type Listener = (request: PendingPreview) => void;

let listener: Listener | null = null;

export function registerImportPreviewListener(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

export function requestImportPreview(
  request: ImportPreviewRequest,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(null);
      return;
    }
    listener({ ...request, resolve });
  });
}
