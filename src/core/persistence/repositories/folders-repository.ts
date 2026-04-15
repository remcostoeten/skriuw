import type { CreateFolderInput, UpdateFolderInput } from "@/core/folders";
import { fromPersistedFolder } from "@/core/folders";
import {
  PERSISTED_STORE_NAMES,
  type FolderId,
  type IsoTime,
  type PersistedFolder,
} from "@/core/shared/persistence-types";
import {
  getRemoteRecord,
  listRemoteRecords,
  putRemoteRecord,
  softDeleteRemoteRecords,
} from "@/core/persistence/supabase";
import { destroyLocalRecord, getLocalRecord, listLocalRecords, putLocalRecord } from "./local-records";
import { isCloudWorkspaceTarget, type WorkspaceTarget } from "./workspace-target";
import type { FoldersRepository } from "./contracts";
import type { NoteFolder } from "@/types/notes";

function collectDescendantFolderIds(
  folders: Array<{ id: FolderId; parentId: FolderId | null }>,
  folderId: FolderId,
): Set<FolderId> {
  const descendants = new Set<FolderId>([folderId]);
  const stack: FolderId[] = [folderId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const folder of folders) {
      if (folder.parentId === current && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        stack.push(folder.id);
      }
    }
  }

  return descendants;
}

export function createFoldersRepository(target: WorkspaceTarget): FoldersRepository {
  return {
    list: async () => {
      const records = isCloudWorkspaceTarget(target)
        ? await listRemoteRecords(PERSISTED_STORE_NAMES.folders, target.userId)
        : await listLocalRecords(PERSISTED_STORE_NAMES.folders);

      return records.map((folder) => fromPersistedFolder(folder));
    },
    create: async (input) => {
      const timestamp = input.createdAt ?? new Date();
      const persistedFolder: PersistedFolder = {
        id: (input.id ?? crypto.randomUUID()) as FolderId,
        name: input.name,
        parentId: input.parentId ?? null,
        createdAt: timestamp.toISOString() as IsoTime,
        updatedAt: (input.updatedAt ?? timestamp).toISOString() as IsoTime,
      };

      if (isCloudWorkspaceTarget(target)) {
        await putRemoteRecord(PERSISTED_STORE_NAMES.folders, persistedFolder, target.userId);
      } else {
        await putLocalRecord(PERSISTED_STORE_NAMES.folders, persistedFolder);
      }

      return fromPersistedFolder(persistedFolder);
    },
    update: async (input) => {
      const existing = isCloudWorkspaceTarget(target)
        ? await getRemoteRecord(PERSISTED_STORE_NAMES.folders, input.id, target.userId)
        : await getLocalRecord(PERSISTED_STORE_NAMES.folders, input.id);

      if (!existing) {
        return undefined;
      }

      const updated = {
        ...existing,
        name: input.name ?? existing.name,
        parentId: input.parentId === undefined ? existing.parentId : input.parentId,
        updatedAt: (input.updatedAt ?? new Date()).toISOString() as typeof existing.updatedAt,
      };

      if (isCloudWorkspaceTarget(target)) {
        await putRemoteRecord(PERSISTED_STORE_NAMES.folders, updated, target.userId);
      } else {
        await putLocalRecord(PERSISTED_STORE_NAMES.folders, updated);
      }

      return fromPersistedFolder(updated);
    },
    destroy: async (id) => {
      const folders = isCloudWorkspaceTarget(target)
        ? await listRemoteRecords(PERSISTED_STORE_NAMES.folders, target.userId)
        : await listLocalRecords(PERSISTED_STORE_NAMES.folders);

      const descendantIds = collectDescendantFolderIds(folders, id);

      const notes = isCloudWorkspaceTarget(target)
        ? await listRemoteRecords(PERSISTED_STORE_NAMES.notes, target.userId)
        : await listLocalRecords(PERSISTED_STORE_NAMES.notes);

      const noteIdsToDelete = notes
        .filter((note) => note.parentId && descendantIds.has(note.parentId))
        .map((note) => note.id);

      if (isCloudWorkspaceTarget(target)) {
        await Promise.all([
          softDeleteRemoteRecords(
            PERSISTED_STORE_NAMES.folders,
            Array.from(descendantIds),
            target.userId,
          ),
          softDeleteRemoteRecords(PERSISTED_STORE_NAMES.notes, noteIdsToDelete, target.userId),
        ]);
        return;
      }

      await Promise.all([
        ...Array.from(descendantIds).map((folderId) =>
          destroyLocalRecord(PERSISTED_STORE_NAMES.folders, folderId),
        ),
        ...noteIdsToDelete.map((noteId) => destroyLocalRecord(PERSISTED_STORE_NAMES.notes, noteId)),
      ]);
    },
  };
}
