import { PERSISTED_STORE_NAMES, type FolderId } from "@/core/shared/persistence-types";
import { getRecord, listRecords } from "@/core/storage";
import type { NoteFolder } from "@/types/notes";
import { fromPersistedFolder } from "./mappers";

export async function readFolders(): Promise<NoteFolder[]> {
  const folders = await listRecords(PERSISTED_STORE_NAMES.folders);
  return folders.map((folder) => fromPersistedFolder(folder));
}

export async function readFolderById(id: FolderId): Promise<NoteFolder | undefined> {
  const folder = await getRecord(PERSISTED_STORE_NAMES.folders, id);
  return folder ? fromPersistedFolder(folder) : undefined;
}
