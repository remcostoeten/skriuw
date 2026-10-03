import { noop } from "@skriuw/shared/helpers/noop";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import { count, publishTransferReport } from "@/features/transfer/dialogs/report";
import {
  detectImportSource,
  importSourceKey,
  type ImportBundle,
} from "@/features/transfer/import/parsing/bundle";
import { normalizeMdxTree } from "@/features/transfer/import/parsing/mdx";
import { toOpenedFileReceipts } from "@/features/transfer/opened-file-origin";
import {
  planImportBundle,
  type ImportBundlePlan,
  type ImportDuplicateMode,
} from "@/features/transfer/import/planning/bundle";
import { applyImportGrouping } from "@/features/transfer/import/planning/grouping";
import { buildImportPreviewCandidate } from "@/features/transfer/import/planning/preview";
import { importSources } from "@/features/transfer/import/sources/registry";
import {
  requestImportPreview,
  type ImportPreviewSelection,
} from "@/features/transfer/dialogs/preview-controller";
import {
  beginImportProgress,
  throwIfImportCancelled,
} from "@/features/transfer/dialogs/progress-controller";
import { cleanupImportSource, prepareImportSources } from "@/features/transfer/files/access";
import {
  allowsRemoteImageDownload,
  distinctDownloadableImages,
  downloadRemoteImages,
  importPlannedImages,
  preflightPlannedImages,
  readablePlannedImageCount,
} from "./images";

export type CommitOperations = (operations: WorkspaceOperation[]) => Promise<void>;

export type ImportNotesOptions = {
  /** Destination the preview dialog opens with; null/omitted opens on the root. */
  initialDestinationFolderId?: string | null;
  /** Runs after a successful commit with the notes the import created. */
  onImported?: (result: { createdNoteIds: readonly string[] }) => void;
  /** Imports into the workspace root with the detected source, without the preview dialog or report. */
  skipPreview?: boolean;
  /** Absolute path of a file the operating system opened, recorded as the note's origin. */
  openedFilePath?: string;
};

export async function importNotesFromPath(
  store: RendererStore,
  commit: CommitOperations,
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
    const tree = normalizeMdxTree(prepared.tree);
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
          ? [
              [
                document.noteId,
                {
                  id: document.noteId,
                  title: node.title,
                  revision: document.revision,
                },
              ] as const,
            ]
          : [];
      }),
    );
    const duplicateModes: readonly ImportDuplicateMode[] = ["skip", "update", "copy"];
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
      prepared.assetRoot,
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
    const selection: ImportPreviewSelection | null = options.skipPreview
      ? {
          sourceId: detectedSource.id,
          destinationFolderId: null,
          duplicateMode: "copy",
          recordSource: false,
          groupIntoSourceFolder: false,
          groupByYear: false,
        }
      : await requestImportPreview({
          sourcePath,
          candidates: candidates.map((candidate) => ({
            sourceId: candidate.source.id,
            sourceLabel: candidate.source.label,
            variants: Object.fromEntries(
              duplicateModes.map((mode) => [mode, candidate.variants[mode].preview]),
            ) as Record<ImportDuplicateMode, ReturnType<typeof buildImportPreviewCandidate>>,
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
    const selected = candidates.find((candidate) => candidate.source.id === selection.sourceId);
    if (!selected) {
      return;
    }
    const { bundle } = selected;
    const { plan } = selected.variants[selection.duplicateMode];
    const groupingOperations = applyImportGrouping(
      plan.operations,
      {
        destinationFolderId: selection.destinationFolderId,
        sourceFolderLabel: selection.groupIntoSourceFolder ? bundle.sourceLabel : null,
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
    const allowRemoteImages = await allowsRemoteImageDownload(
      store,
      commit,
      distinctDownloadableImages(plan),
    );
    const commitProgress = beginImportProgress({
      phase: "images",
      completed: 0,
      total: null,
      cancellable: true,
    });
    finishCommitProgress = commitProgress.finish;
    const images = await importPlannedImages(
      plan,
      prepared.assetRoot,
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
    const remote = allowRemoteImages
      ? await downloadRemoteImages(plan, at, commitProgress.signal, (completed, total) =>
          commitProgress.update({
            phase: "images",
            completed,
            total,
            cancellable: true,
          }),
        )
      : null;
    throwIfImportCancelled(commitProgress.signal);
    const operations = [
      ...(options.openedFilePath
        ? toOpenedFileReceipts(plan.operations, options.openedFilePath)
        : plan.operations),
      ...(selection.recordSource ? plan.sourcePropertyOperations : []),
      ...images.attachOperations,
      ...(remote?.attachOperations ?? []),
      ...plan.contentOperations,
    ];
    if (operations.length > 0) {
      commitProgress.update({
        phase: "committing",
        completed: 0,
        total: 1,
        cancellable: false,
      });
      await commit(operations);
    }
    commitProgress.finish();
    options.onImported?.({
      createdNoteIds: plan.operations.flatMap((operation) =>
        operation.type === "create_note" ? [operation.id] : [],
      ),
    });
    if (options.skipPreview) {
      return;
    }
    publishTransferReport({
      title: `Import complete (${bundle.sourceLabel})`,
      lines: [
        `Imported ${count(plan.createdNotes, "new note")}, updated ${plan.updatedNotes}, skipped ${plan.skippedDuplicates}, and created ${count(plan.folderCount + groupingOperations.length, "folder")} from ${sourcePath}`,
        ...(images.imported > 0 ? [`Imported ${count(images.imported, "image")}`] : []),
        ...(images.skipped > 0 ? [`Skipped ${count(images.skipped, "unreadable image")}`] : []),
        ...(remote && remote.imported > 0
          ? [`Downloaded ${count(remote.imported, "remote image")}`]
          : []),
        ...(remote && remote.failed > 0
          ? [`Could not download ${count(remote.failed, "remote image")}`]
          : []),
        ...(plan.remoteImages - (remote?.imported ?? 0) > 0
          ? [
              `Blocked ${count(plan.remoteImages - (remote?.imported ?? 0), "remote image")} from loading`,
            ]
          : []),
        ...(plan.unresolvedReferences > 0
          ? [
              `Kept ${count(plan.unresolvedReferences, "ambiguous or unresolved wiki-link")} as source text`,
            ]
          : []),
        ...(plan.preservedSources > 0
          ? [
              `Preserved ${count(plan.preservedSources, "note with unsupported Markdown")} in raw mode`,
            ]
          : []),
        ...(plan.createdTags > 0 ? [`Created ${count(plan.createdTags, "tag")}`] : []),
        ...(plan.pinnedNotes > 0 ? [`Pinned ${count(plan.pinnedNotes, "note")}`] : []),
        ...(selection.recordSource && plan.sourcePropertyNotes > 0
          ? [`Recorded the import source on ${count(plan.sourcePropertyNotes, "new note")}`]
          : []),
        ...(plan.tagSkippedNotes > 0
          ? [`Skipped tags on ${count(plan.tagSkippedNotes, "raw-preserved note")}`]
          : []),
        ...(plan.tagPropertyNotes > 0
          ? [`Stored tags as a property on ${count(plan.tagPropertyNotes, "raw-preserved note")}`]
          : []),
        ...(plan.skippedTags > 0
          ? [`Skipped ${count(plan.skippedTags, "invalid or oversized tag")}`]
          : []),
        ...(tree.skipped > 0 ? [`Skipped ${count(tree.skipped, "unreadable file")}`] : []),
        ...(tree.unsupported ?? []).map((path) => `Skipped unsupported attachment ${path}`),
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
