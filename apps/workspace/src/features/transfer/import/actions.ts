import { noop } from "@skriuw/shared/helpers/noop";
import { appRouteHash } from "@skriuw/renderer-core/route/app-route";
import type {
  OpenedFileState,
  ProviderImportReceipt,
} from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { commitOperations } from "@/store/commit";
import { flushPendingWork } from "@/store/pending-work";
import { activateNote } from "@/features/notes/navigation";
import { publishTransferReport, reportFailure } from "@/features/transfer/dialogs/report";
import { requestOpenedFileConflictChoice } from "@/features/transfer/dialogs/opened-file-conflict-controller";
import { fileFormatForPath, fileFormats } from "@/features/transfer/file-formats";
import { contentHash, importSourceKey } from "@/features/transfer/import/parsing/bundle";
import { OPENED_FILE_PROVIDER, type OpenedFile } from "@/features/transfer/opened-file-origin";
import {
  importNotesFromPath,
  type CommitOperations,
} from "@/features/transfer/import/execution/pipeline";
import {
  cleanupImportSource,
  pickDirectory,
  pickImportFile,
  pickImportFiles,
  prepareImportSources,
} from "@/features/transfer/files/access";

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

const MARKDOWN_FILE_EXTENSIONS = fileFormats.flatMap((format) => format.extensions);
// Marks a note whose state when its file was first recorded is unknown, so a later file change asks instead of overwriting.
const UNKNOWN_NOTE_HASH = "";

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

async function readOpenedFile(filePath: string): Promise<string> {
  const prepared = await prepareImportSources([filePath]);
  try {
    const file = prepared.tree.files[0];
    if (!file) {
      throw new Error(`${filePath} could not be read as text`);
    }
    return file.content;
  } finally {
    if (prepared.temporary) {
      await cleanupImportSource(prepared.rootPath).catch(noop);
    }
  }
}

async function importOpenedFile(
  store: RendererStore,
  opened: OpenedFile,
  noteId?: string,
): Promise<string | null> {
  let createdNoteIds: readonly string[] = [];
  await importNotesFromPath(store, commitTo(store), [opened.path], {
    skipPreview: true,
    openedFile: noteId ? { ...opened, noteId } : opened,
    onImported: (result) => {
      createdNoteIds = result.createdNoteIds;
    },
  });
  return noteId ?? createdNoteIds[0] ?? null;
}

function recordOpenedFile(
  store: RendererStore,
  receipt: ProviderImportReceipt,
  sourceKey: string,
  filePath: string,
  openedFile: OpenedFileState,
): Promise<void> {
  return commitOperations(store, [
    {
      type: "record_provider_import",
      receipt: {
        ...receipt,
        provider: OPENED_FILE_PROVIDER,
        sourceKey,
        sourcePath: filePath,
        importedAt: Date.now(),
        openedFile,
      },
    },
  ]);
}

async function settleOpenedFileConflict(
  store: RendererStore,
  receipt: ProviderImportReceipt,
  sourceKey: string,
  opened: OpenedFile,
  noteHash: string,
): Promise<void> {
  const noteTitle = store.getState().nodes.get(receipt.noteId)?.title ?? "Untitled";
  const choice = await requestOpenedFileConflictChoice(noteTitle, opened.path);
  await flushPendingWork();
  if (choice === "file") {
    await importOpenedFile(store, opened, receipt.noteId);
  } else if (choice === "note") {
    await recordOpenedFile(store, receipt, sourceKey, opened.path, {
      formatId: opened.formatId,
      fileHash: opened.fileHash,
      noteHash,
    });
  } else if (choice === "both") {
    const noteId = await importOpenedFile(store, opened);
    if (noteId) {
      window.location.hash = appRouteHash("notes");
      activateNote(store, noteId);
    }
  }
}

async function reopenFile(
  store: RendererStore,
  receipt: ProviderImportReceipt,
  sourceKey: string,
  opened: OpenedFile,
): Promise<string> {
  const document = store.getState().documents.get(receipt.noteId);
  if (!document || document.sealed) {
    return receipt.noteId;
  }
  const baseline = receipt.openedFile;
  const moved = receipt.sourceKey !== sourceKey || receipt.provider !== OPENED_FILE_PROVIDER;
  if (!baseline) {
    await recordOpenedFile(store, receipt, sourceKey, opened.path, {
      formatId: opened.formatId,
      fileHash: opened.fileHash,
      noteHash: UNKNOWN_NOTE_HASH,
    });
    return receipt.noteId;
  }
  if (baseline.fileHash === opened.fileHash) {
    if (moved) {
      await recordOpenedFile(store, receipt, sourceKey, opened.path, baseline);
    }
    return receipt.noteId;
  }
  const noteHash = await contentHash(document.markdown);
  if (baseline.noteHash === noteHash) {
    await importOpenedFile(store, opened, receipt.noteId);
    return receipt.noteId;
  }
  void settleOpenedFileConflict(store, receipt, sourceKey, opened, noteHash).catch((error) =>
    reportFailure(`Could not update the note from ${opened.path}`, error),
  );
  return receipt.noteId;
}

/**
 * @name openFileInWorkspace
 * @description Opens a file the operating system handed to Skriuw (a
 * double-click in the file manager) as a note. The first open imports it as a
 * new root note through the regular import pipeline without the preview
 * dialog. Opening it again returns that note and brings it up to date: a file
 * changed outside Skriuw replaces the note body when the note was not edited
 * since, a note edited in Skriuw is kept when the file did not change, and
 * when both changed the user picks a side once the note is open. A file that
 * moved is recognised by its contents. Returns the note to show, or null when
 * nothing could be opened.
 *
 * @example
 * const noteId = await openFileInWorkspace(store, "/home/me/notes/todo.md");
 * if (noteId) activateNote(store, noteId);
 */
export async function openFileInWorkspace(
  store: RendererStore,
  filePath: string,
): Promise<string | null> {
  const format = fileFormatForPath(filePath);
  if (!format) {
    reportFailure(
      `Could not open ${filePath}`,
      new Error("Skriuw does not open this kind of file"),
    );
    return null;
  }
  try {
    await flushPendingWork();
    const [sourceKey, content] = await Promise.all([
      importSourceKey(filePath),
      readOpenedFile(filePath),
    ]);
    const opened: OpenedFile = {
      path: filePath,
      formatId: format.id,
      fileHash: await contentHash(content),
    };
    const state = store.getState();
    const present = state.importReceipts.filter((receipt) => state.nodes.has(receipt.noteId));
    const previous =
      present.find((receipt) => receipt.sourceKey === sourceKey) ??
      present.find(
        (receipt) =>
          receipt.provider === OPENED_FILE_PROVIDER &&
          receipt.openedFile?.fileHash === opened.fileHash,
      );
    return previous
      ? await reopenFile(store, previous, sourceKey, opened)
      : await importOpenedFile(store, opened);
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
