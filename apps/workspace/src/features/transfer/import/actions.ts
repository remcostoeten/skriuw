import { commitOperations } from "@/store/commit";
import { flushPendingWork } from "@/store/pending-work";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { publishTransferReport, reportFailure } from "@/features/transfer/dialogs/report";
import { importSourceKey } from "@/features/transfer/import/parsing/bundle";
import { OPENED_FILE_PROVIDER } from "@/features/transfer/opened-file-origin";
import {
  importNotesFromPath,
  type CommitOperations,
} from "@/features/transfer/import/execution/pipeline";
import { pickDirectory, pickImportFile, pickImportFiles } from "@/features/transfer/files/access";

function commitTo(store: RendererStore): CommitOperations {
  return (operations) => commitOperations(store, operations);
}

export async function importMarkdownIntoWorkspace(store: RendererStore): Promise<void> {
  try {
    const sourceDir = await pickDirectory("Import notes from folder");
    if (sourceDir) {
      await importNotesFromPath(store, commitTo(store), [sourceDir]);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      publishTransferReport({ title: "Import cancelled", lines: ["Nothing changed."] });
    } else {
      reportFailure("Import failed", error);
    }
  }
}

const MARKDOWN_FILE_EXTENSIONS = ["md", "markdown", "mdx", "txt"];

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
    const filePath = await pickImportFile("Import markdown file", MARKDOWN_FILE_EXTENSIONS);
    if (!filePath) {
      return null;
    }
    let createdNoteIds: readonly string[] = [];
    await importNotesFromPath(store, commitTo(store), [filePath], {
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

/**
 * @name openMarkdownFileInWorkspace
 * @description Opens a Markdown or MDX file the operating system handed to
 * Skriuw (a double-click in the file manager). The first open imports it as a
 * new root note through the regular import pipeline without the preview
 * dialog; opening the same path again returns the note it created before
 * instead of duplicating it. Returns the note to show, or null when nothing
 * could be imported.
 *
 * @example
 * const noteId = await openMarkdownFileInWorkspace(store, "/home/me/notes/todo.md");
 * if (noteId) activateNote(store, noteId);
 */
export async function openMarkdownFileInWorkspace(
  store: RendererStore,
  filePath: string,
): Promise<string | null> {
  try {
    await flushPendingWork();
    const sourceKey = await importSourceKey(filePath);
    const state = store.getState();
    const previous = state.importReceipts.find(
      (receipt) => receipt.sourceKey === sourceKey && state.nodes.has(receipt.noteId),
    );
    if (previous) {
      if (previous.provider !== OPENED_FILE_PROVIDER) {
        await commitOperations(store, [
          {
            type: "record_provider_import",
            receipt: { ...previous, provider: OPENED_FILE_PROVIDER, sourcePath: filePath },
          },
        ]);
      }
      return previous.noteId;
    }
    let createdNoteIds: readonly string[] = [];
    await importNotesFromPath(store, commitTo(store), [filePath], {
      skipPreview: true,
      openedFilePath: filePath,
      onImported: (result) => {
        createdNoteIds = result.createdNoteIds;
      },
    });
    return createdNoteIds[0] ?? null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    reportFailure(`Could not open ${filePath}`, error);
    return null;
  }
}

export async function importProviderExportIntoWorkspace(store: RendererStore): Promise<void> {
  try {
    const sourceFiles = await pickImportFiles("Import notes from files or archive");
    if (sourceFiles.length > 0) {
      await importNotesFromPath(store, commitTo(store), sourceFiles);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      publishTransferReport({ title: "Import cancelled", lines: ["Nothing changed."] });
    } else {
      reportFailure("Import failed", error);
    }
  }
}
