export type MediaUploadState =
  | { status: "saving"; label: string }
  | { status: "failed"; message: string; retry: (() => void) | null };

type Listener = () => void;

const uploads = new Map<string, MediaUploadState>();
const listeners = new Set<Listener>();

/** The in-flight or failed upload for a media node id, if any. */
export function mediaUploadState(id: string): MediaUploadState | undefined {
  return uploads.get(id);
}

/** Records (or clears, with `null`) the upload state for a media node id. */
export function setMediaUploadState(id: string, state: MediaUploadState | null): void {
  if (state === null) {
    if (!uploads.delete(id)) return;
  } else {
    uploads.set(id, state);
  }
  for (const listener of listeners) {
    listener();
  }
}

/** Subscribes to any upload state change; returns the unsubscribe function. */
export function subscribeMediaUploads(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
