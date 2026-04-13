import type { CreateNoteInput, UpdateNoteInput } from "@/core/notes";
import { fromPersistedNote, toPersistedNote } from "@/core/notes";
import { PERSISTED_STORE_NAMES, type NoteId } from "@/core/shared/persistence-types";
import type { NoteFile } from "@/types/notes";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import {
  getRemotePersistenceUserId,
  getRemoteRecord,
  listRemoteRecords,
  putRemoteRecord,
  softDeleteRemoteRecord,
} from "@/core/persistence/supabase";
import { destroyLocalRecord, getLocalRecord, listLocalRecords, putLocalRecord } from "./local-records";

export interface NotesRepository {
  list(): Promise<NoteFile[]>;
  create(input: CreateNoteInput): Promise<NoteFile>;
  update(input: UpdateNoteInput): Promise<NoteFile | undefined>;
  destroy(id: NoteId): Promise<void>;
}

export const notesRepository: NotesRepository = {
  list: async () => {
    const remoteUserId = getRemotePersistenceUserId();
    const records = remoteUserId
      ? await listRemoteRecords(PERSISTED_STORE_NAMES.notes, remoteUserId)
      : await listLocalRecords(PERSISTED_STORE_NAMES.notes);
    return records.map(fromPersistedNote);
  },
  create: async (input) => {
    const remoteUserId = getRemotePersistenceUserId();
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
    if (remoteUserId) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.notes, persistedNote, remoteUserId);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.notes, persistedNote);
    }

    return fromPersistedNote(persistedNote);
  },
  update: async (input) => {
    const remoteUserId = getRemotePersistenceUserId();
    const existing = remoteUserId
      ? await getRemoteRecord(PERSISTED_STORE_NAMES.notes, input.id, remoteUserId)
      : await getLocalRecord(PERSISTED_STORE_NAMES.notes, input.id);

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

    if (remoteUserId) {
      await putRemoteRecord(PERSISTED_STORE_NAMES.notes, updated, remoteUserId);
    } else {
      await putLocalRecord(PERSISTED_STORE_NAMES.notes, updated);
    }

    return fromPersistedNote(updated);
  },
  destroy: (id) => {
    const remoteUserId = getRemotePersistenceUserId();
    return remoteUserId
      ? softDeleteRemoteRecord(PERSISTED_STORE_NAMES.notes, id, remoteUserId)
      : destroyLocalRecord(PERSISTED_STORE_NAMES.notes, id);
  },
};
