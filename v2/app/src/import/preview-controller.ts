import type { ImportPreviewCandidate } from "./preview";
import type { ImportDuplicateMode } from "./plan";

export type ImportPreviewRequest = {
  sourcePath: string;
  candidates: readonly {
    sourceId: string;
    sourceLabel: string;
    variants: Record<ImportDuplicateMode, ImportPreviewCandidate>;
  }[];
  detectedSourceId: string;
  destinations: readonly { id: string | null; label: string }[];
  /**
   * Destination the dialog opens with, e.g. the sidebar's focused folder at
   * trigger time. Null (or omitted) opens on the workspace root, matching the
   * dialog's long-standing default.
   */
  initialDestinationFolderId?: string | null;
};

export type ImportPreviewSelection = {
  sourceId: string;
  destinationFolderId: string | null;
  duplicateMode: ImportDuplicateMode;
  recordSource: boolean;
};

type PendingPreview = ImportPreviewRequest & {
  resolve: (selection: ImportPreviewSelection | null) => void;
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
): Promise<ImportPreviewSelection | null> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(null);
      return;
    }
    listener({ ...request, resolve });
  });
}
