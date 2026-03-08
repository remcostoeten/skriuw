import {
  PERSISTED_STORE_NAMES,
  type FolderId,
  type PersistedFolder,
} from "@/core/shared/persistence-types";
import { runInTransaction, toStorageError } from "@/core/storage";

function collectDescendantFolderIds(folders: PersistedFolder[], folderId: FolderId): Set<FolderId> {
  const descendants = new Set<FolderId>([folderId]);
  const stack: FolderId[] = [folderId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    folders.forEach((folder) => {
      if (folder.parentId === current && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        stack.push(folder.id);
      }
    });
  }

  return descendants;
}

export async function destroyFolder(id: FolderId): Promise<void> {
  await runInTransaction(
    [PERSISTED_STORE_NAMES.folders, PERSISTED_STORE_NAMES.notes],
    "readwrite",
    async (stores) => {
      const folderStore = stores.get(PERSISTED_STORE_NAMES.folders);
      const noteStore = stores.get(PERSISTED_STORE_NAMES.notes);

      if (!folderStore || !noteStore) {
        throw toStorageError("transaction_failed", "Missing object stores for folder destruction.");
      }

      const folders = await new Promise<PersistedFolder[]>((resolve, reject) => {
        const request = folderStore.getAll();
        request.onsuccess = () => resolve(request.result as PersistedFolder[]);
        request.onerror = () =>
          reject(
            toStorageError(
              "transaction_failed",
              "Failed to list folders before recursive destroy.",
              request.error,
            ),
          );
      });

      const descendantIds = collectDescendantFolderIds(folders, id);

      await Promise.all(
        Array.from(descendantIds).map(
          (folderId) =>
            new Promise<void>((resolve, reject) => {
              const request = folderStore.delete(folderId);
              request.onsuccess = () => resolve();
              request.onerror = () =>
                reject(
                  toStorageError(
                    "transaction_failed",
                    `Failed to destroy folder: ${folderId}`,
                    request.error,
                  ),
                );
            }),
        ),
      );

      const notes = await new Promise<Array<{ id: IDBValidKey; parentId: FolderId | null }>>(
        (resolve, reject) => {
          const request = noteStore.getAll();
          request.onsuccess = () =>
            resolve(request.result as Array<{ id: IDBValidKey; parentId: FolderId | null }>);
          request.onerror = () =>
            reject(
              toStorageError(
                "transaction_failed",
                "Failed to list notes before recursive folder destroy.",
                request.error,
              ),
            );
        },
      );

      await Promise.all(
        notes
          .filter((note) => note.parentId && descendantIds.has(note.parentId))
          .map(
            (note) =>
              new Promise<void>((resolve, reject) => {
                const request = noteStore.delete(note.id);
                request.onsuccess = () => resolve();
                request.onerror = () =>
                  reject(
                    toStorageError(
                      "transaction_failed",
                      `Failed to destroy note: ${String(note.id)}`,
                      request.error,
                    ),
                  );
              }),
          ),
      );
    },
  );
}
