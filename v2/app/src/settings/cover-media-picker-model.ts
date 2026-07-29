import type { MediaBlobPayload } from "../bridge/commands";
import type { WorkspaceImage } from "../contracts/workspace";

export type CoverMediaPickerFilter = "all" | "used" | "unused" | "duplicates";

export type CoverMediaPickerSort = "recent" | "size" | "usage";

export type CoverMediaPickerOptions = {
  query?: string;
  filter?: CoverMediaPickerFilter;
  sort?: CoverMediaPickerSort;
  currentCoverContentHash?: string | null;
  currentCoverImageId?: string | null;
};

export type CoverMediaPickerItem = MediaBlobPayload & {
  usageCount: number;
  referenceIds: string[];
  noteIds: string[];
  isUsed: boolean;
  isDuplicate: boolean;
  isCurrent: boolean;
};

export function projectCoverMediaPicker(
  blobs: readonly MediaBlobPayload[],
  images: ReadonlyMap<string, WorkspaceImage>,
  options: CoverMediaPickerOptions = {},
): CoverMediaPickerItem[] {
  const referencesByHash = new Map<string, WorkspaceImage[]>();
  for (const image of images.values()) {
    const references = referencesByHash.get(image.contentHash);
    if (references) {
      references.push(image);
    } else {
      referencesByHash.set(image.contentHash, [image]);
    }
  }

  const currentHash =
    options.currentCoverContentHash ??
    findImage(images, options.currentCoverImageId)?.contentHash ??
    null;
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const filter = options.filter ?? "all";
  const sort = options.sort ?? "recent";

  return blobs
    .map((blob) => {
      const references = [...(referencesByHash.get(blob.contentHash) ?? [])].sort(
        compareReferences,
      );
      const referenceIds = references.map((image) => image.id);
      const noteIds = [...new Set(references.map((image) => image.noteId))].sort(
        (left, right) => left.localeCompare(right),
      );
      const usageCount = references.length;
      return {
        ...blob,
        usageCount,
        referenceIds,
        noteIds,
        isUsed: usageCount > 0,
        isDuplicate: usageCount > 1,
        isCurrent: blob.contentHash === currentHash,
      };
    })
    .filter((item) => matchesFilter(item, filter) && matchesQuery(item, query))
    .sort((left, right) => compareItems(left, right, sort));
}

function findImage(
  images: ReadonlyMap<string, WorkspaceImage>,
  imageId: string | null | undefined,
): WorkspaceImage | undefined {
  if (!imageId) {
    return undefined;
  }
  const direct = images.get(imageId);
  if (direct?.id === imageId) {
    return direct;
  }
  return [...images.values()].find((image) => image.id === imageId);
}

function matchesFilter(
  item: CoverMediaPickerItem,
  filter: CoverMediaPickerFilter,
): boolean {
  if (filter === "used") return item.isUsed;
  if (filter === "unused") return !item.isUsed;
  if (filter === "duplicates") return item.isDuplicate;
  return true;
}

function matchesQuery(item: CoverMediaPickerItem, query: string): boolean {
  if (!query) {
    return true;
  }
  return [
    item.contentHash,
    item.mimeType,
    ...item.referenceIds,
    ...item.noteIds,
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

function compareReferences(left: WorkspaceImage, right: WorkspaceImage): number {
  return (
    left.createdAt - right.createdAt ||
    left.noteId.localeCompare(right.noteId) ||
    left.id.localeCompare(right.id)
  );
}

function compareItems(
  left: CoverMediaPickerItem,
  right: CoverMediaPickerItem,
  sort: CoverMediaPickerSort,
): number {
  if (left.isCurrent !== right.isCurrent) {
    return left.isCurrent ? -1 : 1;
  }
  if (sort === "size") {
    return (
      right.byteSize - left.byteSize ||
      right.modifiedAtMs - left.modifiedAtMs ||
      left.contentHash.localeCompare(right.contentHash)
    );
  }
  if (sort === "usage") {
    return (
      right.usageCount - left.usageCount ||
      right.modifiedAtMs - left.modifiedAtMs ||
      left.contentHash.localeCompare(right.contentHash)
    );
  }
  return (
    right.modifiedAtMs - left.modifiedAtMs ||
    left.contentHash.localeCompare(right.contentHash)
  );
}
