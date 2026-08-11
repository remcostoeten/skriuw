import { commitOperations } from "@/store/actions/workspace";
import {
  exportMarkdownTree,
  importMarkdownImage,
  cleanupImportSource,
  pickDirectory,
  pickImportFile,
  pickImportFiles,
  prepareImportSources,
  type StoredImagePayload,
} from "@/bridge/commands";
import { productSchema, serializeProductMarkdown } from "@/editor/schema";
import { flushPendingWork } from "@/lifecycle/pending-work";
import { noop } from "@/shared/lib/noop";
import type { RendererStore } from "@/store/types";
import type { WorkspaceOperation } from "@/contracts/workspace";
import {
  buildImageExportEntries,
  buildNoteExportEntry,
  buildWorkspaceExportEntries,
  collectImageRefIds,
  collectLocalImageSources,
  referenceSafeMarkdown,
  replaceLocalImages,
  resolveImportedImagePath,
  rewriteExportedImagePaths,
  type MarkdownImportPlan,
} from "./markdown-transfer-model";
import { publishTransferReport } from "./transfer-report";
import { detectImportSource, importSourceKey } from "@/import/model";
import type { ImportBundle } from "@/import/model";
import {
  applyImportGrouping,
  planImportBundle,
  type ImportBundlePlan,
  type ImportDuplicateMode,
} from "@/import/plan";
import { importSources } from "@/import/sources";
import { buildImportPreviewCandidate } from "@/import/preview";
import { requestImportPreview } from "@/import/preview-controller";
import {
  beginImportProgress,
  throwIfImportCancelled,
} from "@/import/progress-controller";

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

function reportFailure(title: string, error: unknown): void {
  publishTransferReport({
    title,
    lines: [error instanceof Error ? error.message : String(error)],
  });
}

export async function exportNoteAsMarkdown(
  store: RendererStore,
  noteId: string,
): Promise<void> {
  const state = store.getState();
  const node = state.nodes.get(noteId);
  if (!node) {
    return;
  }
  try {
    const targetDir = await pickDirectory("Export note as Markdown");
    if (!targetDir) {
      return;
    }
    const record = state.documents.get(noteId);
    const imageIds = collectImageRefIds(record?.documentJson);
    const markdown = referenceSafeMarkdown(
      record?.documentJson,
      record?.markdown ?? "",
      state.nodes,
    );
    const entry = buildNoteExportEntry(
      node.title,
      rewriteExportedImagePaths(markdown, state.images, imageIds),
    );
    const imageEntries = buildImageExportEntries(state.images, imageIds, "", new Set());
    await exportMarkdownTree([entry, ...imageEntries], targetDir);
    publishTransferReport({
      title: "Note exported",
      lines: [
        `Wrote ${entry.relativePath} to ${targetDir}`,
        ...(imageEntries.length > 0
          ? [`Copied ${count(imageEntries.length, "image")} into images/`]
          : []),
      ],
    });
  } catch (error) {
    reportFailure("Note export failed", error);
  }
}

export async function exportWorkspaceAsMarkdown(store: RendererStore): Promise<void> {
  try {
    const targetDir = await pickDirectory("Export workspace as Markdown");
    if (!targetDir) {
      return;
    }
    const entries = buildWorkspaceExportEntries(store.getState());
    await exportMarkdownTree(entries, targetDir);
    const notes = entries.filter((entry) => entry.kind === "note").length;
    const images = entries.filter((entry) => entry.kind === "image").length;
    publishTransferReport({
      title: "Workspace exported",
      lines: [
        `Wrote ${count(notes, "note")} and ${count(entries.length - notes - images, "folder")} to ${targetDir}`,
        ...(images > 0 ? [`Copied ${count(images, "image")}`] : []),
      ],
    });
  } catch (error) {
    reportFailure("Workspace export failed", error);
  }
}

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

async function preflightPlannedImages(
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

function readablePlannedImageCount(
  plan: MarkdownImportPlan,
  cache: ImportedImageCache,
): number {
  return plannedImagePaths(plan).filter((path) => cache.get(path) !== null)
    .length;
}

async function importPlannedImages(
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

type ImportNotesOptions = {
  /** Destination the preview dialog opens with; null/omitted opens on the root. */
  initialDestinationFolderId?: string | null;
  /** Runs after a successful commit with the notes the import created. */
  onImported?: (result: { createdNoteIds: readonly string[] }) => void;
};

async function importNotesFromPath(
  store: RendererStore,
  sourcePaths: string[],
  options: ImportNotesOptions = {},
): Promise<void> {
  const sourcePath =
    sourcePaths.length === 1 && sourcePaths[0]
      ? sourcePaths[0]
      : count(sourcePaths.length, "selected file");
  const intake = beginImportProgress({
    phase: "reading",
    completed: 0,
    total: null,
    cancellable: true,
  });
  let finishCommitProgress = noop;
  let prepared: Awaited<ReturnType<typeof prepareImportSources>> | null = null;
  try {
    prepared = await prepareImportSources(sourcePaths);
    throwIfImportCancelled(intake.signal);
    const tree = prepared.tree;
    const detectedSource = detectImportSource(importSources, tree);
    if (!detectedSource) {
      publishTransferReport({
        title: "Nothing to import",
        lines: [`No importable notes found in ${sourcePath}`],
      });
      return;
    }
    const at = Date.now();
    const state = store.getState();
    const sourceKey = await importSourceKey(sourcePaths.join("\n"));
    const existingNotes = [...state.nodes.values()]
      .filter((node) => node.kind === "note")
      .map((node) => ({ id: node.id, title: node.title }));
    const presentNoteIds = new Set(existingNotes.map((note) => note.id));
    const existingTags = [...state.tags.values()].map((tag) => ({
      id: tag.id,
      name: tag.name,
    }));
    const existingDocuments = new Map(
      [...state.documents.values()].flatMap((document) => {
        const node = state.nodes.get(document.noteId);
        return node
          ? [[
              document.noteId,
              {
                id: document.noteId,
                title: node.title,
                revision: document.revision,
              },
            ] as const]
          : [];
      }),
    );
    const duplicateModes: readonly ImportDuplicateMode[] = [
      "skip",
      "update",
      "copy",
    ];
    const scoredSources = importSources
      .map((source) => ({ source, score: source.detect(tree) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score);
    intake.update({
      phase: "parsing",
      completed: 0,
      total: scoredSources.length,
      cancellable: true,
    });
    const candidates: {
      source: (typeof importSources)[number];
      bundle: ImportBundle;
      variants: Record<
        ImportDuplicateMode,
        {
          plan: ImportBundlePlan;
          preview: ReturnType<typeof buildImportPreviewCandidate>;
        }
      >;
    }[] = [];
    for (const [index, { source }] of scoredSources.entries()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      throwIfImportCancelled(intake.signal);
      const bundle = source.parse(tree);
      const variants = Object.fromEntries(
        duplicateModes.map((duplicateMode) => {
          const plan = planImportBundle(
            bundle,
            at,
            () => crypto.randomUUID(),
            existingNotes,
            existingTags,
            {
              duplicateMode,
              sourceKey,
              receipts: state.importReceipts,
              presentNoteIds,
              existingDocuments,
              existingPropertiesByNoteId: state.propertiesByNoteId,
            },
          );
          return [
            duplicateMode,
            {
              plan,
              preview: buildImportPreviewCandidate(bundle, plan, tree),
            },
          ];
        }),
      ) as Record<
        ImportDuplicateMode,
        {
          plan: ImportBundlePlan;
          preview: ReturnType<typeof buildImportPreviewCandidate>;
        }
      >;
      candidates.push({ source, bundle, variants });
      intake.update({
        phase: "parsing",
        completed: index + 1,
        total: scoredSources.length,
        cancellable: true,
      });
    }
    const imageCache = await preflightPlannedImages(
      candidates.flatMap((candidate) =>
        duplicateModes.map((mode) => candidate.variants[mode].plan),
      ),
      prepared.rootPath,
      intake.signal,
      (completed, total) =>
        intake.update({
          phase: "images",
          completed,
          total,
          cancellable: true,
        }),
    );
    for (const candidate of candidates) {
      for (const mode of duplicateModes) {
        const variant = candidate.variants[mode];
        variant.preview = buildImportPreviewCandidate(
          candidate.bundle,
          variant.plan,
          tree,
          readablePlannedImageCount(variant.plan, imageCache),
        );
      }
    }
    intake.finish();
    const selection = await requestImportPreview({
      sourcePath,
      candidates: candidates.map((candidate) => ({
        sourceId: candidate.source.id,
        sourceLabel: candidate.source.label,
        variants: Object.fromEntries(
          duplicateModes.map((mode) => [
            mode,
            candidate.variants[mode].preview,
          ]),
        ) as Record<
          ImportDuplicateMode,
          ReturnType<typeof buildImportPreviewCandidate>
        >,
      })),
      detectedSourceId: detectedSource.id,
      destinations: [
        { id: null, label: "Workspace root" },
        ...state.nodeOrder.flatMap((id) => {
          const node = state.nodes.get(id);
          return node?.kind === "folder"
            ? [{ id, label: `${"  ".repeat(node.depth)}${node.title}` }]
            : [];
        }),
      ],
      initialDestinationFolderId: options.initialDestinationFolderId ?? null,
    });
    if (!selection) {
      return;
    }
    const selected = candidates.find(
      (candidate) => candidate.source.id === selection.sourceId,
    );
    if (!selected) {
      return;
    }
    const { bundle } = selected;
    const { plan } = selected.variants[selection.duplicateMode];
    const groupingOperations = applyImportGrouping(
      plan.operations,
      {
        destinationFolderId: selection.destinationFolderId,
        sourceFolderLabel: selection.groupIntoSourceFolder
          ? bundle.sourceLabel
          : null,
        groupByYear: selection.groupByYear,
        existingNodes: [...store.getState().nodes.values()].map((node) => ({
          id: node.id,
          parentId: node.parentId,
          kind: node.kind,
          title: node.title,
        })),
      },
      at,
      () => crypto.randomUUID(),
    );
    plan.operations.unshift(...groupingOperations);
    const commitProgress = beginImportProgress({
      phase: "images",
      completed: 0,
      total: null,
      cancellable: true,
    });
    finishCommitProgress = commitProgress.finish;
    const images = await importPlannedImages(
      plan,
      prepared.rootPath,
      at,
      commitProgress.signal,
      (completed, total) =>
        commitProgress.update({
          phase: "images",
          completed,
          total,
          cancellable: true,
        }),
      imageCache,
    );
    throwIfImportCancelled(commitProgress.signal);
    const operations = [
      ...plan.operations,
      ...(selection.recordSource ? plan.sourcePropertyOperations : []),
      ...images.attachOperations,
      ...plan.contentOperations,
    ];
    if (operations.length > 0) {
      commitProgress.update({
        phase: "committing",
        completed: 0,
        total: 1,
        cancellable: false,
      });
      await commitOperations(store, operations);
    }
    commitProgress.finish();
    options.onImported?.({
      createdNoteIds: plan.operations.flatMap((operation) =>
        operation.type === "create_note" ? [operation.id] : [],
      ),
    });
    publishTransferReport({
      title: `Import complete (${bundle.sourceLabel})`,
      lines: [
        `Imported ${count(plan.createdNotes, "new note")}, updated ${plan.updatedNotes}, skipped ${plan.skippedDuplicates}, and created ${count(plan.folderCount + groupingOperations.length, "folder")} from ${sourcePath}`,
        ...(images.imported > 0 ? [`Imported ${count(images.imported, "image")}`] : []),
        ...(images.skipped > 0
          ? [`Skipped ${count(images.skipped, "unreadable image")}`]
          : []),
        ...(plan.remoteImages > 0
          ? [`Blocked ${count(plan.remoteImages, "remote image")} from loading`]
          : []),
        ...(plan.unresolvedReferences > 0
          ? [`Kept ${count(plan.unresolvedReferences, "ambiguous or unresolved wiki-link")} as source text`]
          : []),
        ...(plan.preservedSources > 0
          ? [`Preserved ${count(plan.preservedSources, "note with unsupported Markdown")} in raw mode`]
          : []),
        ...(plan.createdTags > 0 ? [`Created ${count(plan.createdTags, "tag")}`] : []),
        ...(plan.pinnedNotes > 0 ? [`Pinned ${count(plan.pinnedNotes, "note")}`] : []),
        ...(selection.recordSource && plan.sourcePropertyNotes > 0
          ? [
              `Recorded the import source on ${count(plan.sourcePropertyNotes, "new note")}`,
            ]
          : []),
        ...(plan.tagSkippedNotes > 0
          ? [
              `Skipped tags on ${count(plan.tagSkippedNotes, "raw-preserved note")}`,
            ]
          : []),
        ...(plan.tagPropertyNotes > 0
          ? [
              `Stored tags as a property on ${count(plan.tagPropertyNotes, "raw-preserved note")}`,
            ]
          : []),
        ...(plan.skippedTags > 0
          ? [`Skipped ${count(plan.skippedTags, "invalid or oversized tag")}`]
          : []),
        ...(tree.skipped > 0 ? [`Skipped ${count(tree.skipped, "unreadable file")}`] : []),
        ...(tree.unsupported ?? []).map(
          (path) => `Skipped unsupported attachment ${path}`,
        ),
        ...bundle.warnings.map((warning) => warning.message),
      ],
    });
  } finally {
    intake.finish();
    finishCommitProgress();
    if (prepared?.temporary) {
      await cleanupImportSource(prepared.rootPath).catch(noop);
    }
  }
}

export async function importMarkdownIntoWorkspace(store: RendererStore): Promise<void> {
  try {
    const sourceDir = await pickDirectory("Import notes from folder");
    if (sourceDir) {
      await importNotesFromPath(store, [sourceDir]);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      publishTransferReport({ title: "Import cancelled", lines: ["Nothing changed."] });
    } else {
      reportFailure("Import failed", error);
    }
  }
}

const MARKDOWN_FILE_EXTENSIONS = ["md", "markdown", "txt"];

let markdownFileImportInFlight = false;

/**
 * Imports a single Markdown/plain-text file as a new note through the same
 * pipeline as "Import notes from folder…" (`importNotesFromPath`), for the
 * `ctrl+shift+o` shortcut. Flushes pending edits before the picker opens, and
 * a second call while one import is still running is a no-op instead of
 * stacking a second picker. Returns the notes the import created so the
 * caller can switch to them, or null when nothing changed.
 */
export async function importMarkdownFileIntoWorkspace(
  store: RendererStore,
  initialDestinationFolderId: string | null,
): Promise<readonly string[] | null> {
  if (markdownFileImportInFlight) {
    return null;
  }
  markdownFileImportInFlight = true;
  try {
    await flushPendingWork();
    const filePath = await pickImportFile(
      "Import markdown file",
      MARKDOWN_FILE_EXTENSIONS,
    );
    if (!filePath) {
      return null;
    }
    let createdNoteIds: readonly string[] = [];
    await importNotesFromPath(store, [filePath], {
      initialDestinationFolderId,
      onImported: (result) => {
        createdNoteIds = result.createdNoteIds;
      },
    });
    return createdNoteIds;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      publishTransferReport({ title: "Import cancelled", lines: ["Nothing changed."] });
    } else {
      reportFailure("Import failed", error);
    }
    return null;
  } finally {
    markdownFileImportInFlight = false;
  }
}

export async function importProviderExportIntoWorkspace(
  store: RendererStore,
): Promise<void> {
  try {
    const sourceFiles = await pickImportFiles("Import notes from files or archive");
    if (sourceFiles.length > 0) {
      await importNotesFromPath(store, sourceFiles);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      publishTransferReport({ title: "Import cancelled", lines: ["Nothing changed."] });
    } else {
      reportFailure("Import failed", error);
    }
  }
}
