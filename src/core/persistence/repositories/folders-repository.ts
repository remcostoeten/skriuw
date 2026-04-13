import type { CreateFolderInput, UpdateFolderInput } from "@/core/folders";
import { fromPersistedFolder } from "@/core/folders";
import {
  PERSISTED_STORE_NAMES,
  type FolderId,
  type IsoTime,
  type PersistedFolder,
} from "@/core/shared/persistence-types";
import type { NoteFolder } from "@/types/notes";
import {
  getRemotePersistenceUserId,
  getRemoteRecord,
  listRemoteRecords,
  putRemoteRecord,
  softDeleteRemoteRecords,
} from "@/core/persistence/supabase";
import { destroyLocalRecord, getLocalRecord, listLocalRecords, putLocalRecord } from "./local-records";

export interface FoldersRepository {
  list(): Promise<NoteFolder[]>;
  create(input: CreateFolderInput): Promise<NoteFolder>;
  update(input: UpdateFolderInput): Promise<NoteFolder | undefined>;
  destroy(id: FolderId): Promise<void>;
}

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

export const foldersRepository: FoldersRepository = {
  list: async () => {
    const remoteUserId = getRemotePersistenceUserId();
    const records = remoteUserId
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.folders, remoteUserId)
      : await listLocalRecords(PERSISTED_STORE_NAMES.folders);

    return records.map((folder) => fromPersistedFolder(folder));
  },
  create: async (input) => {
    const remoteUserId = getRemotePersistenceUserId();
    const timestamp = input.createdAt ?? new Date();
    const persistedFolder: PersistedFolder = {
      id: (input.id ?? crypto.randomUUID()) as FolderId,
      name: input.name,
      parentId: input.parentId ?? null,
      createdAt: timestamp.toISOString() as IsoTime,
      updatedAt: (input.updatedAt ?? timestamp).toISOString() as IsoTime,
    };

    if (remoteUserId) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.folders, persistedFolder, remoteUserId);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.folders, persistedFolder);
    }

    return fromPersistedFolder(persistedFolder);
  },
  update: async (input) => {
    const remoteUserId = getRemotePersistenceUserId();
    const existing = remoteUserId
      ? await getRemoteRecord(PERSISTED_STORE_NAMES.folders, input.id, remoteUserId)
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

    if (remoteUserId) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.folders, updated, remoteUserId);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.folders, updated);
    }

    return fromPersistedFolder(updated);
  },
  destroy: async (id) => {
    const remoteUserId = getRemotePersistenceUserId();
    const folders = remoteUserId
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.folders, remoteUserId)
      : await listLocalRecords(PERSISTED_STORE_NAMES.folders);

    const descendantIds = collectDescendantFolderIds(folders, id);

    const notes = remoteUserId
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.notes, remoteUserId)
      : await listLocalRecords(PERSISTED_STORE_NAMES.notes);

    const noteIdsToDelete = notes
      .filter((note) => note.parentId && descendantIds.has(note.parentId))
      .map((note) => note.id);

    if (remoteUserId) {
      await Promise.all([
        softDeleteRemoteRecords(PERSISTED_STORE_NAMES.folders, Array.from(descendantIds), remoteUserId),
        softDeleteRemoteRecords(PERSISTED_STORE_NAMES.notes, noteIdsToDelete, remoteUserId),
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
