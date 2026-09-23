import type { MediaBlobPayload } from "@/bridge/commands";
import type { MediaMetadata } from "@skriuw/renderer-core/contracts/workspace";

/**
 * Library assets of one kind that match `query` against the given name, alt
 * text, mime type or content hash, newest first. Metadata is optional so the
 * picker still filters by format and hash when no names are known.
 */
export function filterLibraryMedia(
  blobs: readonly MediaBlobPayload[],
  kind: "image" | "video",
  query: string,
  metadata?: ReadonlyMap<string, MediaMetadata>,
): MediaBlobPayload[] {
  const needle = query.trim().toLocaleLowerCase();
  return blobs
    .filter((blob) => blob.mimeType.startsWith(`${kind}/`))
    .filter((blob) => {
      if (!needle) return true;
      const named = metadata?.get(blob.contentHash);
      return [blob.mimeType, blob.contentHash, named?.name ?? "", named?.alt ?? ""].some((field) =>
        field.toLocaleLowerCase().includes(needle),
      );
    })
    .sort(
      (left, right) =>
        right.modifiedAtMs - left.modifiedAtMs || left.contentHash.localeCompare(right.contentHash),
    );
}
