import { collectLocalImageSources } from "../export/markdown-transfer-model";
import type { MarkdownTree } from "../export/markdown-transfer-model";
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
  warningLines: string[];
};

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

export function buildImportPreviewCandidate(
  bundle: ImportBundle,
  plan: ImportBundlePlan,
  tree: MarkdownTree,
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
    ...(plan.tagSkippedNotes > 0
      ? [`Tags cannot attach to ${count(plan.tagSkippedNotes, "raw-preserved note")}`]
      : []),
    ...(tree.skipped > 0 ? [`${count(tree.skipped, "unreadable file")} will be skipped`] : []),
    ...bundle.warnings.map((warning) =>
      warning.path ? `${warning.path}: ${warning.message}` : warning.message,
    ),
  ];
  return {
    sourceId: bundle.sourceId,
    sourceLabel: bundle.sourceLabel,
    noteCount: plan.noteCount,
    folderCount: plan.folderCount,
    localImageCount,
    createdTagCount: plan.createdTags,
    propertyCount,
    warningLines,
  };
}
