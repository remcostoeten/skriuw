import { createFolder, destroyFolder, readFolders, updateFolder } from "@/core/folders";
import type { CreateFolderInput, UpdateFolderInput } from "@/core/folders";
import { fromPersistedFolder } from "@/core/folders";
import {
  PERSISTED_STORE_NAMES,
  type FolderId,
  type IsoTime,
  type PersistedFolder,
} from "@/core/shared/persistence-types";
import {
  destroyPGliteRecord,
  getPGliteRecord,
  listPGliteRecords,
  putPGliteRecord,
} from "@/core/persistence/pglite";
import type { NoteFolder } from "@/types/notes";
import { pushRecordToRemote, deleteRecordFromRemote } from "@/core/persistence/supabase";
import { resolveLocalPersistenceBackend } from "./local-backend";

export interface FoldersRepository {
  list(): Promise<NoteFolder[]>;
  create(input: CreateFolderInput): Promise<NoteFolder>;
  update(input: UpdateFolderInput): Promise<NoteFolder | undefined>;
  destroy(id: FolderId): Promise<void>;
}

export const indexedDbFoldersRepository: FoldersRepository = {
  list: () => readFolders(),
  create: (input) => createFolder(input),
  update: (input) => updateFolder(input),
  destroy: (id) => destroyFolder(id),
};

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

export const pGliteFoldersRepository: FoldersRepository = {
  list: async () => {
    const records = await listPGliteRecords(PERSISTED_STORE_NAMES.folders);
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

    await putPGliteRecord(PERSISTED_STORE_NAMES.folders, persistedFolder);

    void pushRecordToRemote(PERSISTED_STORE_NAMES.folders, persistedFolder as unknown as Record<string, unknown>);

    return fromPersistedFolder(persistedFolder);
  },
  update: async (input) => {
    const existing = await getPGliteRecord(PERSISTED_STORE_NAMES.folders, input.id);
    if (!existing) {
      return undefined;
    }

    const updated = {
      ...existing,
      name: input.name ?? existing.name,
      parentId: input.parentId === undefined ? existing.parentId : input.parentId,
      updatedAt: (input.updatedAt ?? new Date()).toISOString() as typeof existing.updatedAt,
    };

    await putPGliteRecord(PERSISTED_STORE_NAMES.folders, updated);

    void pushRecordToRemote(PERSISTED_STORE_NAMES.folders, updated as unknown as Record<string, unknown>);

    return fromPersistedFolder(updated);
  },
  destroy: async (id) => {
    const folders = await listPGliteRecords(PERSISTED_STORE_NAMES.folders);
    const descendantIds = collectDescendantFolderIds(folders, id);

    const notes = await listPGliteRecords(PERSISTED_STORE_NAMES.notes);
    const noteIdsToDelete = notes
      .filter((note) => note.parentId && descendantIds.has(note.parentId))
      .map((note) => note.id);

    await Promise.all([
      ...Array.from(descendantIds).map((folderId) =>
        destroyPGliteRecord(PERSISTED_STORE_NAMES.folders, folderId),
      ),
      ...noteIdsToDelete.map((noteId) => destroyPGliteRecord(PERSISTED_STORE_NAMES.notes, noteId)),
    ]);

    // Fire-and-forget remote deletes
    for (const folderId of descendantIds) {
      void deleteRecordFromRemote(PERSISTED_STORE_NAMES.folders, folderId);
    }
    for (const noteId of noteIdsToDelete) {
      void deleteRecordFromRemote(PERSISTED_STORE_NAMES.notes, noteId);
    }
  },
};

export const foldersRepository: FoldersRepository = {
  list: async () => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite" ? pGliteFoldersRepository.list() : indexedDbFoldersRepository.list();
  },
  create: async (input) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteFoldersRepository.create(input)
      : indexedDbFoldersRepository.create(input);
  },
  update: async (input) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteFoldersRepository.update(input)
      : indexedDbFoldersRepository.update(input);
  },
  destroy: async (id) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteFoldersRepository.destroy(id)
      : indexedDbFoldersRepository.destroy(id);
  },
};
