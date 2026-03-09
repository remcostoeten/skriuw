import {
  PERSISTED_STORE_NAMES,
  type FolderId,
  type IsoTime,
} from "@/core/shared/persistence-types";
import { putRecord } from "@/core/storage";
import type { NoteFolder } from "@/types/notes";
import { fromPersistedFolder } from "./mappers";
import type { CreateFolderInput } from "./types";

export async function createFolder(input: CreateFolderInput): Promise<NoteFolder> {
  const timestamp = input.createdAt ?? new Date();
  const created = await putRecord(PERSISTED_STORE_NAMES.folders, {
    id: (input.id ?? crypto.randomUUID()) as FolderId,
    name: input.name,
    parentId: input.parentId ?? null,
    createdAt: timestamp.toISOString() as IsoTime,
    updatedAt: (input.updatedAt ?? timestamp).toISOString() as IsoTime,
  });

  return fromPersistedFolder(created, true);
}
