import type {
  ProviderImportReceipt,
  WorkspaceOperation,
} from "@skriuw/renderer-core/contracts/workspace";

export const OPENED_FILE_PROVIDER = "opened-file";

const originsByReceipts = new WeakMap<
  readonly ProviderImportReceipt[],
  ReadonlyMap<string, string>
>();

function indexOrigins(receipts: readonly ProviderImportReceipt[]): ReadonlyMap<string, string> {
  const cached = originsByReceipts.get(receipts);
  if (cached) {
    return cached;
  }
  const origins = new Map<string, string>();
  for (const receipt of receipts) {
    if (receipt.provider === OPENED_FILE_PROVIDER) {
      origins.set(receipt.noteId, receipt.sourcePath);
    }
  }
  originsByReceipts.set(receipts, origins);
  return origins;
}

/**
 * @name openedFileOrigin
 * @description Returns the absolute path of the file a note was created from
 * when the operating system opened it in Skriuw, or null for notes that were
 * written in Skriuw or imported through the import dialog. The lookup is
 * indexed once per receipts list, so every tree row can call it cheaply.
 *
 * @example
 * openedFileOrigin(state.importReceipts, noteId);
 * // "/home/me/notes/todo.md"
 */
export function openedFileOrigin(
  receipts: readonly ProviderImportReceipt[],
  noteId: string,
): string | null {
  return indexOrigins(receipts).get(noteId) ?? null;
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
 * provider. Other operations pass through unchanged.
 *
 * @example
 * const operations = toOpenedFileReceipts(plan.operations, "/home/me/todo.md");
 */
export function toOpenedFileReceipts(
  operations: readonly WorkspaceOperation[],
  filePath: string,
): WorkspaceOperation[] {
  return operations.map((operation) =>
    operation.type === "record_provider_import"
      ? {
          ...operation,
          receipt: { ...operation.receipt, provider: OPENED_FILE_PROVIDER, sourcePath: filePath },
        }
      : operation,
  );
}
