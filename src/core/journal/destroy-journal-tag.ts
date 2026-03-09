import {
  PERSISTED_STORE_NAMES,
  type IsoTime,
  type TagId,
  type TagName,
} from "@/core/shared/persistence-types";
import { destroyRecord, listRecords, putRecord } from "@/core/storage";

export async function destroyJournalTag(id: TagId): Promise<void> {
  const tags = await listRecords(PERSISTED_STORE_NAMES.tags);
  const tag = tags.find((item) => item.id === id);
  if (!tag) {
    return;
  }

  const entries = await listRecords(PERSISTED_STORE_NAMES.journalEntries);
  await Promise.all(
    entries
      .filter((entry) => entry.tags.includes(tag.name as TagName))
      .map((entry) =>
        putRecord(PERSISTED_STORE_NAMES.journalEntries, {
          ...entry,
          tags: entry.tags.filter((tagName) => tagName !== tag.name),
          updatedAt: new Date().toISOString() as IsoTime,
        }),
      ),
  );

  await destroyRecord(PERSISTED_STORE_NAMES.tags, id);
}
