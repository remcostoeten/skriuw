import type { StoredImagePayload } from "@skriuw/renderer-core/bridge/port";
import { productSchema, serializeProductMarkdown } from "@/features/editor/schema";
import { noop } from "@skriuw/shared/helpers/noop";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import { remoteImportImages } from "@/features/settings/settings-model";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import {
  collectLocalImageSources,
  collectRemoteImageSources,
  replaceLocalImages,
  resolveImportedImagePath,
} from "@/features/transfer/import/planning/images";
import type { MarkdownImportPlan } from "@/features/transfer/import/planning/markdown";
import { requestRemoteImageChoice } from "@/features/transfer/dialogs/remote-images-controller";
import { throwIfImportCancelled } from "@/features/transfer/dialogs/progress-controller";
import { downloadRemoteMedia, importMarkdownImage } from "@/features/transfer/files/access";
import type { CommitOperations } from "./pipeline";

type ImportedImages = {
  attachOperations: WorkspaceOperation[];
  imported: number;
  skipped: number;
};

type ImportedImageCache = ReadonlyMap<string, StoredImagePayload | null>;

function plannedImagePaths(plan: MarkdownImportPlan): string[] {
  const noteOperations = new Map(
    plan.contentOperations
      .filter((operation) => operation.type === "save_document")
      .map((operation) => [operation.noteId, operation]),
  );
  return plan.notes.flatMap((note) => {
    const operation = noteOperations.get(note.id);
    return operation?.type === "save_document"
      ? collectLocalImageSources(operation.documentJson).map((source) =>
          resolveImportedImagePath(note.relativePath, source),
        )
      : [];
  });
}

export async function preflightPlannedImages(
  plans: readonly MarkdownImportPlan[],
  sourceDir: string,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<Map<string, StoredImagePayload | null>> {
  const paths = [...new Set(plans.flatMap(plannedImagePaths))];
  const cache = new Map<string, StoredImagePayload | null>();
  for (const [index, path] of paths.entries()) {
    throwIfImportCancelled(signal);
    try {
      cache.set(path, await importMarkdownImage(sourceDir, path));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      cache.set(path, null);
    }
    onProgress(index + 1, paths.length);
  }
  return cache;
}

export function readablePlannedImageCount(
  plan: MarkdownImportPlan,
  cache: ImportedImageCache,
): number {
  return plannedImagePaths(plan).filter((path) => cache.get(path) !== null).length;
}

export async function importPlannedImages(
  plan: MarkdownImportPlan,
  sourceDir: string,
  at: number,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
  cache?: ImportedImageCache,
): Promise<ImportedImages> {
  const noteOperations = new Map(
    plan.contentOperations
      .filter((operation) => operation.type === "save_document")
      .map((operation) => [operation.noteId, operation]),
  );
  const attachOperations: WorkspaceOperation[] = [];
  let imported = 0;
  let skipped = 0;
  const total = plan.notes.reduce((sum, note) => {
    const operation = noteOperations.get(note.id);
    return operation?.type === "save_document"
      ? sum + collectLocalImageSources(operation.documentJson).length
      : sum;
  }, 0);
  let completed = 0;
  for (const note of plan.notes) {
    if (signal) throwIfImportCancelled(signal);
    const operation = noteOperations.get(note.id);
    if (operation?.type !== "save_document") {
      continue;
    }
    const sources = collectLocalImageSources(operation.documentJson);
    if (sources.length === 0) {
      continue;
    }
    const imageIdBySource = new Map<string, string>();
    for (const source of sources) {
      if (signal) throwIfImportCancelled(signal);
      try {
        const path = resolveImportedImagePath(note.relativePath, source);
        const stored = cache?.has(path)
          ? cache.get(path)
          : await importMarkdownImage(sourceDir, path);
        if (!stored) {
          skipped += 1;
          completed += 1;
          onProgress?.(completed, total);
          continue;
        }
        const imageId = crypto.randomUUID();
        imageIdBySource.set(source, imageId);
        attachOperations.push({
          type: "attach_image",
          image: {
            id: imageId,
            noteId: note.id,
            contentHash: stored.contentHash,
            mimeType: stored.mimeType,
            byteSize: stored.byteSize,
            width: null,
            height: null,
            createdAt: at,
          },
        });
        imported += 1;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
        noop();
        skipped += 1;
      }
      completed += 1;
      onProgress?.(completed, total);
    }
    if (imageIdBySource.size > 0) {
      operation.documentJson = replaceLocalImages(operation.documentJson, imageIdBySource);
      operation.markdown = serializeProductMarkdown(
        productSchema.nodeFromJSON(operation.documentJson),
      );
    }
  }
  return { attachOperations, imported, skipped };
}

type DownloadedImages = ImportedImages & { failed: number };

function downloadableImageSources(documentJson: unknown): string[] {
  return collectRemoteImageSources(documentJson).filter((source) => /^https:\/\//i.test(source));
}

function countDownloadableImages(plan: MarkdownImportPlan): number {
  return plan.contentOperations.reduce(
    (sum, operation) =>
      operation.type === "save_document"
        ? sum + downloadableImageSources(operation.documentJson).length
        : sum,
    0,
  );
}

export function distinctDownloadableImages(plan: MarkdownImportPlan): string[] {
  return [
    ...new Set(
      plan.contentOperations.flatMap((operation) =>
        operation.type === "save_document" ? downloadableImageSources(operation.documentJson) : [],
      ),
    ),
  ];
}

/**
 * Settles whether this import downloads remote images. The first import that
 * meets one asks, and the answer becomes the workspace setting; dismissing the
 * prompt keeps them blocked this time and asks again next time.
 */
export async function allowsRemoteImageDownload(
  store: RendererStore,
  commit: CommitOperations,
  sources: readonly string[],
): Promise<boolean> {
  if (sources.length === 0 || isBrowserRuntime()) {
    return false;
  }
  const policy = remoteImportImages(store.getState().settings);
  if (policy !== "ask") {
    return policy === "download";
  }
  const choice = await requestRemoteImageChoice(sources);
  if (!choice) {
    return false;
  }
  await commit([
    {
      type: "update_settings",
      settings: { ...store.getState().settings, remoteImportImages: choice },
    },
  ]);
  return choice === "download";
}

export async function downloadRemoteImages(
  plan: MarkdownImportPlan,
  at: number,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<DownloadedImages> {
  const downloads = new Map<string, Promise<StoredImagePayload | null>>();
  const attachOperations: WorkspaceOperation[] = [];
  let imported = 0;
  let failed = 0;
  let completed = 0;
  const total = countDownloadableImages(plan);
  for (const operation of plan.contentOperations) {
    if (operation.type !== "save_document") {
      continue;
    }
    const imageIdBySource = new Map<string, string>();
    for (const source of downloadableImageSources(operation.documentJson)) {
      throwIfImportCancelled(signal);
      let download = downloads.get(source);
      if (!download) {
        download = downloadRemoteMedia(source).catch(() => null);
        downloads.set(source, download);
      }
      const stored = await download;
      completed += 1;
      onProgress(completed, total);
      if (!stored) {
        failed += 1;
        continue;
      }
      const imageId = crypto.randomUUID();
      imageIdBySource.set(source, imageId);
      attachOperations.push({
        type: "attach_image",
        image: {
          id: imageId,
          noteId: operation.noteId,
          contentHash: stored.contentHash,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          width: null,
          height: null,
          createdAt: at,
        },
      });
      imported += 1;
    }
    if (imageIdBySource.size > 0) {
      operation.documentJson = replaceLocalImages(operation.documentJson, imageIdBySource);
      operation.markdown = serializeProductMarkdown(
        productSchema.nodeFromJSON(operation.documentJson),
      );
    }
  }
  return { attachOperations, imported, skipped: 0, failed };
}
