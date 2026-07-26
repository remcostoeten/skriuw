import { commitOperations } from "../actions/workspace";
import {
  exportMarkdownTree,
  importMarkdownImage,
  cleanupImportSource,
  pickDirectory,
  pickImportFile,
  prepareImportSource,
} from "../bridge/commands";
import { productSchema, serializeProductMarkdown } from "../editor/schema";
import { noop } from "../shared/lib/noop";
import type { RendererStore } from "../store/types";
import type { WorkspaceOperation } from "../contracts/workspace";
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
import { detectImportSource } from "../import/model";
import { planImportBundle } from "../import/plan";
import { importSources } from "../import/sources";
import { buildImportPreviewCandidate } from "../import/preview";
import { requestImportPreview } from "../import/preview-controller";

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

async function importPlannedImages(
  plan: MarkdownImportPlan,
  sourceDir: string,
  at: number,
): Promise<ImportedImages> {
  const noteOperations = new Map(
    plan.contentOperations
      .filter((operation) => operation.type === "save_document")
      .map((operation) => [operation.noteId, operation]),
  );
  const attachOperations: WorkspaceOperation[] = [];
  let imported = 0;
  let skipped = 0;
  for (const note of plan.notes) {
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
      try {
        const stored = await importMarkdownImage(
          sourceDir,
          resolveImportedImagePath(note.relativePath, source),
        );
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
      } catch {
        noop();
        skipped += 1;
      }
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

async function importNotesFromPath(
  store: RendererStore,
  sourcePath: string,
): Promise<void> {
  const prepared = await prepareImportSource(sourcePath);
  try {
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
    const existingNotes = [...state.nodes.values()]
      .filter((node) => node.kind === "note")
      .map((node) => ({ id: node.id, title: node.title }));
    const existingTags = [...state.tags.values()].map((tag) => ({
      id: tag.id,
      name: tag.name,
    }));
    const candidates = importSources
      .map((source) => ({ source, score: source.detect(tree) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .map(({ source }) => {
        const bundle = source.parse(tree);
        const plan = planImportBundle(
          bundle,
          at,
          () => crypto.randomUUID(),
          existingNotes,
          existingTags,
        );
        return {
          source,
          bundle,
          plan,
          preview: buildImportPreviewCandidate(bundle, plan, tree),
        };
      });
    const selectedSourceId = await requestImportPreview({
      sourcePath,
      candidates: candidates.map((candidate) => candidate.preview),
      detectedSourceId: detectedSource.id,
    });
    if (!selectedSourceId) {
      return;
    }
    const selected = candidates.find(
      (candidate) => candidate.source.id === selectedSourceId,
    );
    if (!selected) {
      return;
    }
    const { bundle, plan } = selected;
    const images = await importPlannedImages(plan, prepared.rootPath, at);
    const operations = [
      ...plan.operations,
      ...images.attachOperations,
      ...plan.contentOperations,
    ];
    if (operations.length > 0) {
      await commitOperations(store, operations);
    }
    publishTransferReport({
      title: `Import complete (${bundle.sourceLabel})`,
      lines: [
        `Imported ${count(plan.noteCount, "note")} and ${count(plan.folderCount, "folder")} from ${sourcePath}`,
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
    if (prepared.temporary) {
      await cleanupImportSource(prepared.rootPath).catch(noop);
    }
  }
}

export async function importMarkdownIntoWorkspace(store: RendererStore): Promise<void> {
  try {
    const sourceDir = await pickDirectory("Import notes from folder");
    if (sourceDir) {
      await importNotesFromPath(store, sourceDir);
    }
  } catch (error) {
    reportFailure("Import failed", error);
  }
}

export async function importProviderExportIntoWorkspace(
  store: RendererStore,
): Promise<void> {
  try {
    const sourceFile = await pickImportFile("Import notes from file or archive");
    if (sourceFile) {
      await importNotesFromPath(store, sourceFile);
    }
  } catch (error) {
    reportFailure("Import failed", error);
  }
}
