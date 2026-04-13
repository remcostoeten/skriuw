import { PERSISTED_STORE_NAMES, type NoteId, type PersistedNote } from "@/core/shared/persistence-types";
import { destroyRecord } from "@/core/storage/destroy-record";
import { getRecord } from "@/core/storage/get-record";
import { listRecords } from "@/core/storage/list-records";
import { putRecord } from "@/core/storage/put-record";

export async function readNoteRecord(id: NoteId) {
  return getRecord(PERSISTED_STORE_NAMES.notes, id);
}

export async function listNoteRecords() {
  return listRecords(PERSISTED_STORE_NAMES.notes);
}

export async function writeNoteRecord(record: PersistedNote) {
  return putRecord(PERSISTED_STORE_NAMES.notes, record);
}

export async function destroyNoteRecord(id: NoteId) {
  return destroyRecord(PERSISTED_STORE_NAMES.notes, id);
}
