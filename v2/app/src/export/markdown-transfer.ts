import { commitOperations } from "../actions/workspace";
import { exportMarkdownTree, pickDirectory, readMarkdownTree } from "../bridge/commands";
import type { RendererStore } from "../store/types";
import {
  buildNoteExportEntry,
  buildWorkspaceExportEntries,
  planMarkdownImport,
} from "./markdown-transfer-model";
import { publishTransferReport } from "./transfer-report";

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
    const entry = buildNoteExportEntry(node.title, state.documents.get(noteId)?.markdown ?? "");
    await exportMarkdownTree([entry], targetDir);
    publishTransferReport({
      title: "Note exported",
      lines: [`Wrote ${entry.relativePath} to ${targetDir}`],
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
    publishTransferReport({
      title: "Workspace exported",
      lines: [
        `Wrote ${count(notes, "note")} and ${count(entries.length - notes, "folder")} to ${targetDir}`,
      ],
    });
  } catch (error) {
    reportFailure("Workspace export failed", error);
  }
}

export async function importMarkdownIntoWorkspace(store: RendererStore): Promise<void> {
  try {
    const sourceDir = await pickDirectory("Import Markdown");
    if (!sourceDir) {
      return;
    }
    const tree = await readMarkdownTree(sourceDir);
    const plan = planMarkdownImport(tree, Date.now(), () => crypto.randomUUID());
    if (plan.operations.length > 0) {
      await commitOperations(store, plan.operations);
    }
    publishTransferReport({
      title: "Import complete",
      lines: [
        `Imported ${count(plan.noteCount, "note")} and ${count(plan.folderCount, "folder")} from ${sourceDir}`,
        ...(tree.skipped > 0 ? [`Skipped ${count(tree.skipped, "unreadable file")}`] : []),
      ],
    });
  } catch (error) {
    reportFailure("Import failed", error);
  }
}
