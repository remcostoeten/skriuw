import type { WorkspaceImage } from "../contracts/workspace";

export type ImageInventoryEntry = {
  contentHash: string;
  mimeType: string;
  byteSize: number;
  referenceCount: number;
  noteTitles: string[];
  latestCreatedAt: number;
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

export function projectImageInventory(
  images: ReadonlyMap<string, WorkspaceImage>,
  noteTitles: ReadonlyMap<string, { title: string }>,
): ImageInventoryEntry[] {
  const byHash = new Map<string, ImageInventoryEntry & { noteIds: Set<string> }>();
  for (const image of images.values()) {
    const existing = byHash.get(image.contentHash);
    if (existing) {
      existing.referenceCount += 1;
      existing.noteIds.add(image.noteId);
      existing.latestCreatedAt = Math.max(existing.latestCreatedAt, image.createdAt);
      continue;
    }
    byHash.set(image.contentHash, {
      contentHash: image.contentHash,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      referenceCount: 1,
      noteTitles: [],
      latestCreatedAt: image.createdAt,
      noteIds: new Set([image.noteId]),
    });
  }
  return Array.from(byHash.values())
    .map(({ noteIds, ...entry }) => ({
      ...entry,
      noteTitles: Array.from(noteIds)
        .map((noteId) => noteTitles.get(noteId)?.title ?? "Untitled note")
        .sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => right.latestCreatedAt - left.latestCreatedAt);
}

export function describeImageUsage(entry: ImageInventoryEntry): string {
  const shown = entry.noteTitles.slice(0, 3).join(", ");
  const more =
    entry.noteTitles.length > 3 ? ` and ${entry.noteTitles.length - 3} more` : "";
  const times = entry.referenceCount === 1 ? "once" : `${entry.referenceCount} times`;
  return `Used ${times} in ${shown}${more}`;
}
