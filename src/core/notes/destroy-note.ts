import type { NoteId } from "@/core/shared/persistence-types";
import { destroyNoteRecord } from "./persistence";

export async function destroyNote(id: NoteId): Promise<void> {
  await destroyNoteRecord(id);
}
