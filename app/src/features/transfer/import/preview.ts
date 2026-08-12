import { collectLocalImageSources } from "@/features/transfer/export/markdown-transfer-model";
import type { MarkdownTree } from "@/features/transfer/export/markdown-transfer-model";
import type { ImportBundle } from "./model";
import type { ImportBundlePlan } from "./plan";

export type ImportPreviewCandidate = {
  sourceId: string;
  sourceLabel: string;
  noteCount: number;
  folderCount: number;
  localImageCount: number;
  createdTagCount: number;
  propertyCount: number;
  sourcePropertyNoteCount: number;
  warningLines: string[];
};

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

export function buildImportPreviewCandidate(
  bundle: ImportBundle,
  plan: ImportBundlePlan,
  tree: MarkdownTree,
  readableLocalImageCount?: number,
): ImportPreviewCandidate {
  let localImageCount = 0;
  for (const operation of plan.contentOperations) {
    if (operation.type === "save_document") {
      localImageCount += collectLocalImageSources(operation.documentJson).length;
    }
  }
  const propertyCount = bundle.notes.reduce(
    (total, note) => total + (note.properties?.length ?? 0),
    0,
  );
  const warningLines = [
    ...(plan.duplicateTitles > 0
      ? [`${count(plan.duplicateTitles, "duplicate title")} needs review`]
      : []),
    ...(plan.unresolvedReferences > 0
      ? [
          `${count(plan.unresolvedReferences, "ambiguous or unresolved wiki-link")} will stay as source text`,
        ]
      : []),
    ...(plan.remoteImages > 0
      ? [`${count(plan.remoteImages, "remote image")} will stay blocked`]
      : []),
    ...(plan.preservedSources > 0
      ? [`${count(plan.preservedSources, "note")} will use lossless raw mode`]
      : []),
    ...(plan.updatedNotes > 0
      ? [`${count(plan.updatedNotes, "previously imported note")} will be updated`]
      : []),
    ...(plan.skippedDuplicates > 0
      ? [`${count(plan.skippedDuplicates, "previously imported note")} will be skipped`]
      : []),
    ...(readableLocalImageCount !== undefined &&
    localImageCount > readableLocalImageCount
      ? [
          `${count(localImageCount - readableLocalImageCount, "unreadable image")} will be skipped`,
        ]
      : []),
    ...(plan.tagSkippedNotes > 0
      ? [`Tags cannot attach to ${count(plan.tagSkippedNotes, "raw-preserved note")}`]
      : []),
    ...(plan.tagPropertyNotes > 0
      ? [
          `Tags will use a Tags property on ${count(plan.tagPropertyNotes, "raw-preserved note")}`,
        ]
      : []),
    ...(plan.skippedTags > 0
      ? [`${count(plan.skippedTags, "invalid or oversized tag")} will be skipped`]
      : []),
    ...(tree.skipped > 0 ? [`${count(tree.skipped, "unreadable file")} will be skipped`] : []),
    ...(tree.unsupported ?? []).map(
      (path) => `${path}: unsupported attachment will be skipped`,
    ),
    ...bundle.warnings.map((warning) =>
      warning.path ? `${warning.path}: ${warning.message}` : warning.message,
    ),
  ];
  return {
    sourceId: bundle.sourceId,
    sourceLabel: bundle.sourceLabel,
    noteCount: plan.noteCount,
    folderCount: plan.folderCount,
    localImageCount: readableLocalImageCount ?? localImageCount,
    createdTagCount: plan.createdTags,
    propertyCount,
    sourcePropertyNoteCount: plan.sourcePropertyNotes,
    warningLines,
  };
}
