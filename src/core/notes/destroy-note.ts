import { PERSISTED_STORE_NAMES, type NoteId } from "@/core/shared/persistence-types";
import { destroyRecord } from "@/core/storage";

export async function destroyNote(id: NoteId): Promise<void> {
  await destroyRecord(PERSISTED_STORE_NAMES.notes, id);
}
