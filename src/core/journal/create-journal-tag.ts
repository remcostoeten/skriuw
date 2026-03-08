import { PERSISTED_STORE_NAMES, type IsoTime, type TagId } from "@/core/shared/persistence-types";
import { putRecord } from "@/core/storage";
import type { JournalTag } from "@/modules/journal";
import { fromPersistedJournalTag } from "./mappers";
import type { CreateJournalTagInput } from "./types";

export async function createJournalTag(input: CreateJournalTagInput): Promise<JournalTag> {
  const now = new Date().toISOString() as IsoTime;
  const created = await putRecord(PERSISTED_STORE_NAMES.tags, {
    id: (input.id ?? crypto.randomUUID()) as TagId,
    name: input.name,
    color: input.color,
    createdAt: now,
    updatedAt: now,
  });

  return fromPersistedJournalTag(created);
}
