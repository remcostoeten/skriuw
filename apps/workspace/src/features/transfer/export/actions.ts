import { showToast } from "@/shared/ui/toast";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  buildImageExportEntries,
  buildNoteExportEntry,
  buildWorkspaceExportEntries,
  collectImageRefIds,
  referenceSafeMarkdown,
  rewriteExportedImagePaths,
} from "@/features/transfer/export/entries";
import { exportMarkdownTree, pickDirectory } from "@/features/transfer/files/access";
import { count, publishTransferReport, reportFailure } from "@/features/transfer/dialogs/report";

export async function exportNoteAsMarkdown(store: RendererStore, noteId: string): Promise<void> {
  const state = store.getState();
  const node = state.nodes.get(noteId);
  if (!node) {
    return;
  }
  if ((state.documents.get(noteId)?.sealed ?? null) !== null) {
    showToast({ message: "Unlock the note before exporting it." });
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
