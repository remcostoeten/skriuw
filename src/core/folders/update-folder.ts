import { PERSISTED_STORE_NAMES } from "@/core/shared/persistence-types";
import { getRecord, putRecord } from "@/core/storage";
import type { NoteFolder } from "@/types/notes";
import { fromPersistedFolder } from "./mappers";
import type { UpdateFolderInput } from "./types";

export async function updateFolder(input: UpdateFolderInput): Promise<NoteFolder | undefined> {
  const existing = await getRecord(PERSISTED_STORE_NAMES.folders, input.id);
  if (!existing) {
    return undefined;
  }

  const updated = await putRecord(PERSISTED_STORE_NAMES.folders, {
    ...existing,
    name: input.name ?? existing.name,
    parentId: input.parentId === undefined ? existing.parentId : input.parentId,
    updatedAt: (input.updatedAt ?? new Date()).toISOString() as typeof existing.updatedAt,
  });

  return fromPersistedFolder(updated);
}
