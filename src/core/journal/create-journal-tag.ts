import { type IsoTime, type TagId } from "@/core/shared/persistence-types";
import type { JournalTag } from "@/types/journal";
import { fromPersistedJournalTag } from "./mappers";
import { writeJournalTagRecord } from "./persistence";
import type { CreateJournalTagInput } from "./types";

export async function createJournalTag(input: CreateJournalTagInput): Promise<JournalTag> {
  const now = new Date();
  const created = await writeJournalTagRecord({
    id: (input.id ?? crypto.randomUUID()) as TagId,
    name: input.name,
    color: input.color,
    usageCount: input.usageCount ?? 0,
    lastUsedAt: input.lastUsedAt ?? null,
    createdAt: (input.createdAt ?? now).toISOString() as IsoTime,
    updatedAt: (input.updatedAt ?? now).toISOString() as IsoTime,
  });

  return fromPersistedJournalTag(created);
}
