import type { NoteId } from "@/core/shared/persistence-types";
import type { NoteFile } from "@/types/notes";
import { fromPersistedNote } from "./mappers";
import { listNoteRecords, readNoteRecord } from "./persistence";

export async function readNotes(): Promise<NoteFile[]> {
  const notes = await listNoteRecords();
  return notes.map(fromPersistedNote);
}

export async function readNoteById(id: NoteId): Promise<NoteFile | undefined> {
  const note = await readNoteRecord(id);
  return note ? fromPersistedNote(note) : undefined;
}
