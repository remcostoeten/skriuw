import { createNote, destroyNote, readNotes, updateNote } from "@/core/notes";
import type { CreateNoteInput, UpdateNoteInput } from "@/core/notes";
import { fromPersistedNote, toPersistedNote } from "@/core/notes";
import { PERSISTED_STORE_NAMES, type NoteId } from "@/core/shared/persistence-types";
import {
  destroyPGliteRecord,
  getPGliteRecord,
  listPGliteRecords,
  putPGliteRecord,
} from "@/core/persistence/pglite";
import type { NoteFile } from "@/types/notes";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { pushRecordToRemote, deleteRecordFromRemote } from "@/core/persistence/supabase";
import { resolveLocalPersistenceBackend } from "./local-backend";

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

export const pGliteNotesRepository: NotesRepository = {
  list: async () => {
    const records = await listPGliteRecords(PERSISTED_STORE_NAMES.notes);
    return records.map(fromPersistedNote);
  },
  create: async (input) => {
    const timestamp = input.createdAt ?? new Date();
    const note: NoteFile = {
      id: (input.id ?? crypto.randomUUID()) as NoteId,
      name: input.name.endsWith(".md") ? input.name : `${input.name}.md`,
      content: input.content,
      richContent: input.richContent ?? markdownToRichDocument(input.content as string),
      preferredEditorMode: input.preferredEditorMode ?? "block",
      parentId: input.parentId ?? null,
      createdAt: timestamp,
      modifiedAt: input.updatedAt ?? timestamp,
    };

    const persistedNote = toPersistedNote(note);
    await putPGliteRecord(PERSISTED_STORE_NAMES.notes, persistedNote);

    void pushRecordToRemote(PERSISTED_STORE_NAMES.notes, persistedNote as unknown as Record<string, unknown>);

    return fromPersistedNote(persistedNote);
  },
  update: async (input) => {
    const existing = await getPGliteRecord(PERSISTED_STORE_NAMES.notes, input.id);
    if (!existing) {
      return undefined;
    }

    const updated = {
      ...existing,
      name: input.name
        ? input.name.endsWith(".md")
          ? input.name
          : `${input.name}.md`
        : existing.name,
      content: input.content ?? existing.content,
      richContent:
        input.richContent ??
        (input.content !== undefined
          ? markdownToRichDocument(input.content as string)
          : existing.richContent),
      preferredEditorMode: input.preferredEditorMode ?? existing.preferredEditorMode,
      parentId: input.parentId === undefined ? existing.parentId : input.parentId,
      updatedAt: (input.updatedAt ?? new Date()).toISOString() as typeof existing.updatedAt,
    };

    await putPGliteRecord(PERSISTED_STORE_NAMES.notes, updated);

    void pushRecordToRemote(PERSISTED_STORE_NAMES.notes, updated as unknown as Record<string, unknown>);

    return fromPersistedNote(updated);
  },
  destroy: async (id) => {
    await destroyPGliteRecord(PERSISTED_STORE_NAMES.notes, id);
    void deleteRecordFromRemote(PERSISTED_STORE_NAMES.notes, id);
  },
};

export const notesRepository: NotesRepository = {
  list: async () => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite" ? pGliteNotesRepository.list() : indexedDbNotesRepository.list();
  },
  create: async (input) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteNotesRepository.create(input)
      : indexedDbNotesRepository.create(input);
  },
  update: async (input) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteNotesRepository.update(input)
      : indexedDbNotesRepository.update(input);
  },
  destroy: async (id) => {
    const backend = await resolveLocalPersistenceBackend();
    return backend === "pglite"
      ? pGliteNotesRepository.destroy(id)
      : indexedDbNotesRepository.destroy(id);
  },
};
