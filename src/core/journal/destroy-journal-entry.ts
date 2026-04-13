import { type JournalEntryId } from "@/core/shared/persistence-types";
import { destroyJournalEntryRecord } from "./persistence";

export async function destroyJournalEntry(id: JournalEntryId): Promise<void> {
  await destroyJournalEntryRecord(id);
}
