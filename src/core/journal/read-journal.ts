import { type DateKey, type JournalEntryId } from "@/core/shared/persistence-types";
import type { JournalEntry, JournalTag } from "@/types/journal";
import { fromPersistedJournalEntry, fromPersistedJournalTag } from "./mappers";
import {
  listJournalEntryRecords,
  listJournalTagRecords,
  readJournalEntryRecord,
} from "./persistence";

export async function readJournalEntries(): Promise<JournalEntry[]> {
  const entries = await listJournalEntryRecords();
  return entries.map(fromPersistedJournalEntry);
}

export async function readJournalEntryById(id: JournalEntryId): Promise<JournalEntry | undefined> {
  const entry = await readJournalEntryRecord(id);
  return entry ? fromPersistedJournalEntry(entry) : undefined;
}

export async function readJournalEntryByDateKey(
  dateKey: DateKey,
): Promise<JournalEntry | undefined> {
  const entries = await readJournalEntries();
  return entries.find((entry) => entry.dateKey === dateKey);
}

export async function readJournalTags(): Promise<JournalTag[]> {
  const tags = await listJournalTagRecords();
  return tags.map((tag) => fromPersistedJournalTag(tag));
}
