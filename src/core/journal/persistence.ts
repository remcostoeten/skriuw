import {
  PERSISTED_STORE_NAMES,
  type JournalEntryId,
  type PersistedJournalEntry,
  type PersistedTag,
  type TagId,
} from "@/core/shared/persistence-types";
import { destroyRecord } from "@/core/storage/destroy-record";
import { getRecord } from "@/core/storage/get-record";
import { listRecords } from "@/core/storage/list-records";
import { putRecord } from "@/core/storage/put-record";

export async function readJournalEntryRecord(id: JournalEntryId) {
  return getRecord(PERSISTED_STORE_NAMES.journalEntries, id);
}

export async function listJournalEntryRecords() {
  return listRecords(PERSISTED_STORE_NAMES.journalEntries);
}

export async function writeJournalEntryRecord(record: PersistedJournalEntry) {
  return putRecord(PERSISTED_STORE_NAMES.journalEntries, record);
}

export async function destroyJournalEntryRecord(id: JournalEntryId) {
  return destroyRecord(PERSISTED_STORE_NAMES.journalEntries, id);
}

export async function listJournalTagRecords() {
  return listRecords(PERSISTED_STORE_NAMES.tags);
}

export async function writeJournalTagRecord(record: PersistedTag) {
  return putRecord(PERSISTED_STORE_NAMES.tags, record);
}

export async function destroyJournalTagRecord(id: TagId) {
  return destroyRecord(PERSISTED_STORE_NAMES.tags, id);
}
