import { PERSISTED_STORE_NAMES, type NoteId } from "@/core/shared/persistence-types";
import { getRecord, listRecords } from "@/core/storage";
import type { NoteFile } from "@/types/notes";
import { fromPersistedNote } from "./mappers";

export async function readNotes(): Promise<NoteFile[]> {
  const notes = await listRecords(PERSISTED_STORE_NAMES.notes);
  return notes.map(fromPersistedNote);
}

export async function readNoteById(id: NoteId): Promise<NoteFile | undefined> {
  const note = await getRecord(PERSISTED_STORE_NAMES.notes, id);
  return note ? fromPersistedNote(note) : undefined;
}
