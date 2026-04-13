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
  canUseRemotePersistence,
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
    const records = canUseRemotePersistence()
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.folders)
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

    if (canUseRemotePersistence()) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.folders, persistedFolder);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.folders, persistedFolder);
    }

    return fromPersistedFolder(persistedFolder);
  },
  update: async (input) => {
    const existing = canUseRemotePersistence()
      ? await getRemoteRecord(PERSISTED_STORE_NAMES.folders, input.id)
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

    if (canUseRemotePersistence()) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.folders, updated);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.folders, updated);
    }

    return fromPersistedFolder(updated);
  },
  destroy: async (id) => {
    const folders = canUseRemotePersistence()
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.folders)
      : await listLocalRecords(PERSISTED_STORE_NAMES.folders);

    const descendantIds = collectDescendantFolderIds(folders, id);

    const notes = canUseRemotePersistence()
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.notes)
      : await listLocalRecords(PERSISTED_STORE_NAMES.notes);

    const noteIdsToDelete = notes
      .filter((note) => note.parentId && descendantIds.has(note.parentId))
      .map((note) => note.id);

    if (canUseRemotePersistence()) {
      await Promise.all([
        softDeleteRemoteRecords(PERSISTED_STORE_NAMES.folders, Array.from(descendantIds)),
        softDeleteRemoteRecords(PERSISTED_STORE_NAMES.notes, noteIdsToDelete),
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
