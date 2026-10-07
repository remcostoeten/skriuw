import type {
  ProviderImportReceipt,
  WorkspaceOperation,
} from "@skriuw/renderer-core/contracts/workspace";
import { contentHash } from "@/features/transfer/import/parsing/bundle";

export const OPENED_FILE_PROVIDER = "opened-file";

export type OpenedFile = {
  path: string;
  formatId: string;
  fileHash: string;
};

const originsByReceipts = new WeakMap<
  readonly ProviderImportReceipt[],
  ReadonlyMap<string, ProviderImportReceipt>
>();

function indexOrigins(
  receipts: readonly ProviderImportReceipt[],
): ReadonlyMap<string, ProviderImportReceipt> {
  const cached = originsByReceipts.get(receipts);
  if (cached) {
    return cached;
  }
  const origins = new Map<string, ProviderImportReceipt>();
  for (const receipt of receipts) {
    const known = origins.get(receipt.noteId);
    if (
      receipt.provider === OPENED_FILE_PROVIDER &&
      (!known || receipt.importedAt >= known.importedAt)
    ) {
      origins.set(receipt.noteId, receipt);
    }
  }
  originsByReceipts.set(receipts, origins);
  return origins;
}

/**
 * @name openedFileOrigin
 * @description Returns the absolute path of the file a note was created from
 * when the operating system opened it in Skriuw, or null for notes that were
 * written in Skriuw or imported through the import dialog. A file that moved
 * reports the path it was last opened from. The lookup is indexed once per
 * receipts list, so every tree row can call it cheaply.
 *
 * @example
 * openedFileOrigin(state.importReceipts, noteId);
 * // "/home/me/notes/todo.md"
 */
export function openedFileOrigin(
  receipts: readonly ProviderImportReceipt[],
  noteId: string,
): string | null {
  return indexOrigins(receipts).get(noteId)?.sourcePath ?? null;
}

/**
 * @name fileExtension
 * @description Returns the lowercase extension of a path including its dot,
 * or null when the file name has none.
 *
 * @example
 * fileExtension("/home/me/Docs/Intro.MDX");
 * // ".mdx"
 */
export function fileExtension(path: string): string | null {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : null;
}

/**
 * @name toOpenedFileReceipts
 * @description Rewrites the import receipts of a file the operating system
 * opened so they record the absolute path it came from under the opened-file
 * provider, along with the hashes of the file and of the note body it became,
 * which reopening the file compares against. Other operations pass through
 * unchanged.
 *
 * @example
 * const operations = await toOpenedFileReceipts(plan.operations, plan.contentOperations, opened);
 */
export async function toOpenedFileReceipts(
  operations: readonly WorkspaceOperation[],
  contentOperations: readonly WorkspaceOperation[],
  opened: OpenedFile,
): Promise<WorkspaceOperation[]> {
  const markdownByNoteId = new Map(
    contentOperations.flatMap((operation) =>
      operation.type === "save_document" ? [[operation.noteId, operation.markdown] as const] : [],
    ),
  );
  return Promise.all(
    operations.map(async (operation): Promise<WorkspaceOperation> => {
      if (operation.type !== "record_provider_import") {
        return operation;
      }
      const markdown = markdownByNoteId.get(operation.receipt.noteId) ?? "";
      return {
        ...operation,
        receipt: {
          ...operation.receipt,
          provider: OPENED_FILE_PROVIDER,
          sourcePath: opened.path,
          openedFile: {
            formatId: opened.formatId,
            fileHash: opened.fileHash,
            noteHash: await contentHash(markdown),
          },
        },
      };
    }),
  );
}
