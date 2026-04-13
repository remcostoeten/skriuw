import { type IsoTime, type TagId, type TagName } from "@/core/shared/persistence-types";
import {
  destroyJournalTagRecord,
  listJournalEntryRecords,
  listJournalTagRecords,
  writeJournalEntryRecord,
} from "./persistence";

export async function destroyJournalTag(id: TagId): Promise<void> {
  const tags = await listJournalTagRecords();
  const tag = tags.find((item) => item.id === id);
  if (!tag) {
    return;
  }

  const entries = await listJournalEntryRecords();
  await Promise.all(
    entries
      .filter((entry) => entry.tags.includes(tag.name as TagName))
      .map((entry) =>
        writeJournalEntryRecord({
          ...entry,
          tags: entry.tags.filter((tagName) => tagName !== tag.name),
          updatedAt: new Date().toISOString() as IsoTime,
        }),
      ),
  );

  await destroyJournalTagRecord(id);
}
