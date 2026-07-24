import type { MediaBlobPayload } from "../bridge/commands";
import type { WorkspaceImage } from "../contracts/workspace";

export type MediaUsage = {
  noteId: string;
  title: string;
  count: number;
};

export type MediaLibraryEntry = {
  contentHash: string;
  mimeType: string;
  byteSize: number;
  modifiedAt: number;
  usages: MediaUsage[];
  missingBlob: boolean;
};

const FORMAT_LABELS: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/gif": "GIF",
  "image/webp": "WebP",
};

export function imageFormatLabel(mimeType: string): string {
  return FORMAT_LABELS[mimeType] ?? "Image";
}

/**
 * Merges the on-disk blob listing with workspace image references into one
 * library view. Blobs without references appear as unused; references whose
 * blob file is gone are kept and flagged so the damage is visible.
 */
export function projectMediaLibrary(
  blobs: readonly MediaBlobPayload[],
  images: ReadonlyMap<string, WorkspaceImage>,
  noteTitles: ReadonlyMap<string, { title: string }>,
): MediaLibraryEntry[] {
  const usageByHash = new Map<string, Map<string, number>>();
  const referenceMeta = new Map<string, { mimeType: string; byteSize: number; createdAt: number }>();
  for (const image of images.values()) {
    const perNote = usageByHash.get(image.contentHash) ?? new Map<string, number>();
    perNote.set(image.noteId, (perNote.get(image.noteId) ?? 0) + 1);
    usageByHash.set(image.contentHash, perNote);
    const meta = referenceMeta.get(image.contentHash);
    referenceMeta.set(image.contentHash, {
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      createdAt: Math.max(meta?.createdAt ?? 0, image.createdAt),
    });
  }

  function usagesFor(contentHash: string): MediaUsage[] {
    const perNote = usageByHash.get(contentHash);
    if (!perNote) {
      return [];
    }
    return Array.from(perNote, ([noteId, count]) => ({
      noteId,
      title: noteTitles.get(noteId)?.title ?? "Untitled note",
      count,
    })).sort((left, right) => left.title.localeCompare(right.title));
  }

  const entries: MediaLibraryEntry[] = blobs.map((blob) => ({
    contentHash: blob.contentHash,
    mimeType: blob.mimeType,
    byteSize: blob.byteSize,
    modifiedAt: Math.max(blob.modifiedAtMs, referenceMeta.get(blob.contentHash)?.createdAt ?? 0),
    usages: usagesFor(blob.contentHash),
    missingBlob: false,
  }));

  const onDisk = new Set(blobs.map((blob) => blob.contentHash));
  for (const [contentHash, meta] of referenceMeta) {
    if (onDisk.has(contentHash)) {
      continue;
    }
    entries.push({
      contentHash,
      mimeType: meta.mimeType,
      byteSize: meta.byteSize,
      modifiedAt: meta.createdAt,
      usages: usagesFor(contentHash),
      missingBlob: true,
    });
  }

  return entries.sort(
    (left, right) =>
      right.modifiedAt - left.modifiedAt || left.contentHash.localeCompare(right.contentHash),
  );
}

export function isUnusedMedia(entry: MediaLibraryEntry): boolean {
  return entry.usages.length === 0;
}

export function countUnusedMedia(entries: readonly MediaLibraryEntry[]): number {
  return entries.filter(isUnusedMedia).length;
}

export function describeMediaUsage(entry: MediaLibraryEntry): string {
  if (entry.usages.length === 0) {
    return "Not used in any note";
  }
  const references = entry.usages.reduce((total, usage) => total + usage.count, 0);
  const shown = entry.usages
    .slice(0, 3)
    .map((usage) => usage.title)
    .join(", ");
  const more = entry.usages.length > 3 ? ` and ${entry.usages.length - 3} more` : "";
  const times = references === 1 ? "once" : `${references} times`;
  return `Used ${times} in ${shown}${more}`;
}
