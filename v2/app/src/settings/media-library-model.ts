import type { MediaBlobPayload } from "@/bridge/commands";
import type { WorkspaceImage } from "@/contracts/workspace";
import { JOURNAL_ROOT_ID } from "@/journal/constants";

export type MediaUsage = {
  noteId: string;
  title: string;
  count: number;
  surface: "note" | "journal";
  placement: "inline" | "cover";
};

export type MediaLibraryEntry = {
  contentHash: string;
  mimeType: string;
  byteSize: number;
  modifiedAt: number;
  createdAt: number | null;
  width: number | null;
  height: number | null;
  usages: MediaUsage[];
  missingBlob: boolean;
};

type MediaNode = {
  title: string;
  parentId: string | null;
  coverImageId?: string | null;
};

type MediaDocument = {
  documentJson: unknown;
};

const FORMAT_LABELS: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/gif": "GIF",
  "image/webp": "WebP",
  "video/mp4": "MP4",
  "video/webm": "WebM",
};

export function imageFormatLabel(mimeType: string): string {
  return FORMAT_LABELS[mimeType] ?? (isVideoMime(mimeType) ? "Video" : "Image");
}

export function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

/**
 * Merges the on-disk blob listing with workspace image references into one
 * library view. Blobs without references appear as unused; references whose
 * blob file is gone are kept and flagged so the damage is visible.
 */
export function projectMediaLibrary(
  blobs: readonly MediaBlobPayload[],
  images: ReadonlyMap<string, WorkspaceImage>,
  nodes: ReadonlyMap<string, MediaNode>,
  documents: ReadonlyMap<string, MediaDocument> = new Map(),
): MediaLibraryEntry[] {
  const usageByHash = new Map<string, Map<string, MediaUsage>>();
  const referenceMeta = new Map<
    string,
    {
      mimeType: string;
      byteSize: number;
      createdAt: number;
      width: number | null;
      height: number | null;
    }
  >();
  for (const image of images.values()) {
    const node = nodes.get(image.noteId);
    const surface = node?.parentId === JOURNAL_ROOT_ID ? "journal" : "note";
    const perHash = usageByHash.get(image.contentHash) ?? new Map<string, MediaUsage>();
    const inlineCount = countImageReferences(
      documents.get(image.noteId)?.documentJson,
      image.id,
    );
    if (inlineCount > 0) {
      addUsage(perHash, {
        noteId: image.noteId,
        title: node?.title ?? "Untitled note",
        count: inlineCount,
        surface,
        placement: "inline",
      });
    }
    if (node?.coverImageId === image.id) {
      addUsage(perHash, {
        noteId: image.noteId,
        title: node.title,
        count: 1,
        surface,
        placement: "cover",
      });
    }
    usageByHash.set(image.contentHash, perHash);
    const meta = referenceMeta.get(image.contentHash);
    referenceMeta.set(image.contentHash, {
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      createdAt: Math.max(meta?.createdAt ?? 0, image.createdAt),
      width: image.width ?? meta?.width ?? null,
      height: image.height ?? meta?.height ?? null,
    });
  }

  function usagesFor(contentHash: string): MediaUsage[] {
    const perHash = usageByHash.get(contentHash);
    if (!perHash) {
      return [];
    }
    return [...perHash.values()].sort(
      (left, right) =>
        left.title.localeCompare(right.title) ||
        left.placement.localeCompare(right.placement),
    );
  }

  const entries: MediaLibraryEntry[] = blobs.map((blob) => {
    const meta = referenceMeta.get(blob.contentHash);
    return {
      contentHash: blob.contentHash,
      mimeType: blob.mimeType,
      byteSize: blob.byteSize,
      modifiedAt: Math.max(blob.modifiedAtMs, meta?.createdAt ?? 0),
      createdAt: meta?.createdAt ?? null,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      usages: usagesFor(blob.contentHash),
      missingBlob: false,
    };
  });

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
      createdAt: meta.createdAt,
      width: meta.width,
      height: meta.height,
      usages: usagesFor(contentHash),
      missingBlob: true,
    });
  }

  return entries.sort(
    (left, right) =>
      right.modifiedAt - left.modifiedAt || left.contentHash.localeCompare(right.contentHash),
  );
}

function addUsage(usages: Map<string, MediaUsage>, usage: MediaUsage): void {
  const key = `${usage.noteId}\0${usage.surface}\0${usage.placement}`;
  const current = usages.get(key);
  usages.set(key, current ? { ...current, count: current.count + usage.count } : usage);
}

function countImageReferences(value: unknown, imageId: string): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as { type?: unknown; attrs?: unknown; content?: unknown };
  const attrs =
    record.attrs !== null && typeof record.attrs === "object"
      ? (record.attrs as { id?: unknown; refId?: unknown })
      : null;
  let count =
    (record.type === "image_ref" && attrs?.id === imageId) ||
    (record.type === "media" && attrs?.refId === imageId)
      ? 1
      : 0;
  if (Array.isArray(record.content)) {
    for (const child of record.content) count += countImageReferences(child, imageId);
  }
  return count;
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
    .map((usage) => `${usage.title} (${usage.placement})`)
    .join(", ");
  const more = entry.usages.length > 3 ? ` and ${entry.usages.length - 3} more` : "";
  const times = references === 1 ? "once" : `${references} times`;
  return `Used ${times} in ${shown}${more}`;
}
