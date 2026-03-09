import {
  PERSISTED_STORE_NAMES,
  type DateKey,
  type JournalEntryId,
} from "@/core/shared/persistence-types";
import { getRecord, listRecords } from "@/core/storage";
import type { JournalEntry, JournalTag } from "@/features/journal/types";
import { fromPersistedJournalEntry, fromPersistedJournalTag } from "./mappers";

export async function readJournalEntries(): Promise<JournalEntry[]> {
  const entries = await listRecords(PERSISTED_STORE_NAMES.journalEntries);
  return entries.map(fromPersistedJournalEntry);
}

export async function readJournalEntryById(id: JournalEntryId): Promise<JournalEntry | undefined> {
  const entry = await getRecord(PERSISTED_STORE_NAMES.journalEntries, id);
  return entry ? fromPersistedJournalEntry(entry) : undefined;
}

export async function readJournalEntryByDateKey(
  dateKey: DateKey,
): Promise<JournalEntry | undefined> {
  const entries = await readJournalEntries();
  return entries.find((entry) => entry.dateKey === dateKey);
}

export async function readJournalTags(): Promise<JournalTag[]> {
  const tags = await listRecords(PERSISTED_STORE_NAMES.tags);
  return tags.map((tag) => fromPersistedJournalTag(tag));
}
