import { createNote, destroyNote, readNotes, updateNote } from "@/core/notes";
import type { CreateNoteInput, UpdateNoteInput } from "@/core/notes";
import type { NoteId } from "@/core/shared/persistence-types";
import type { NoteFile } from "@/types/notes";

export interface NotesRepository {
  list(): Promise<NoteFile[]>;
  create(input: CreateNoteInput): Promise<NoteFile>;
  update(input: UpdateNoteInput): Promise<NoteFile | undefined>;
  destroy(id: NoteId): Promise<void>;
}

export const indexedDbNotesRepository: NotesRepository = {
  list: () => readNotes(),
  create: (input) => createNote(input),
  update: (input) => updateNote(input),
  destroy: (id) => destroyNote(id),
};
