import { readNoteImageBlob } from "@/bridge/commands";

const objectUrlByHash = new Map<string, Promise<string>>();

/**
 * Resolves a stored image blob to an object URL, fetching each content hash
 * at most once for the lifetime of the window.
 */
export function resolveImageBlobUrl(
  contentHash: string,
  mimeType: string,
): Promise<string> {
  const cached = objectUrlByHash.get(contentHash);
  if (cached) {
    return cached;
  }
  const pending = readNoteImageBlob(contentHash, mimeType).then((buffer) =>
    URL.createObjectURL(new Blob([buffer], { type: mimeType })),
  );
  objectUrlByHash.set(contentHash, pending);
  pending.catch(() => {
    objectUrlByHash.delete(contentHash);
  });
  return pending;
}
