import { PERSISTED_STORE_NAMES, type NoteId } from "@/core/shared/persistence-types";
import { putRecord } from "@/core/storage";
import type { NoteFile } from "@/types/notes";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { fromPersistedNote, toPersistedNote } from "./mappers";
import type { CreateNoteInput } from "./types";

export async function createNote(input: CreateNoteInput): Promise<NoteFile> {
  const timestamp = input.createdAt ?? new Date();
  const persistedNote = toPersistedNote({
    id: (input.id ?? crypto.randomUUID()) as NoteId,
    name: input.name.endsWith(".md") ? input.name : `${input.name}.md`,
    content: input.content,
    richContent: input.richContent ?? markdownToRichDocument(input.content as string),
    preferredEditorMode: input.preferredEditorMode ?? "block",
    parentId: input.parentId ?? null,
    createdAt: timestamp,
    modifiedAt: input.updatedAt ?? timestamp,
  });

  const createdNote = await putRecord(PERSISTED_STORE_NAMES.notes, persistedNote);
  return fromPersistedNote(createdNote);
}
