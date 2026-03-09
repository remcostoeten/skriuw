import { PERSISTED_STORE_NAMES, type JournalEntryId } from "@/core/shared/persistence-types";
import { destroyRecord } from "@/core/storage";

export async function destroyJournalEntry(id: JournalEntryId): Promise<void> {
  await destroyRecord(PERSISTED_STORE_NAMES.journalEntries, id);
}
