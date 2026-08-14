import type { TagRecord } from "@/features/references/types";
import type { RendererState } from "@/store/types";
import type { JournalEntry } from "./model";

export type JournalTag = {
  id: string;
  name: string;
  color: string | null;
  entryCount: number;
};

const NO_TAG_IDS: readonly string[] = [];

/**
 * Canonical tag ids an entry references, in document order. Structured
 * references are the source of truth, so renaming a tag never breaks the link
 * and text that merely looks like a tag never creates one.
 */
export function journalEntryTagIds(state: RendererState, noteId: string): readonly string[] {
  const targets = state.outgoingReferences.get(noteId);
  if (targets === undefined) {
    return NO_TAG_IDS;
  }
  const ids: string[] = [];
  for (const target of targets) {
    if (target.kind !== "tag" || ids.includes(target.targetId)) {
      continue;
    }
    if (state.tags.has(target.targetId)) {
      ids.push(target.targetId);
    }
  }
  return ids.length === 0 ? NO_TAG_IDS : ids;
}

/** Tags carried by at least one journal entry, most used first. */
export function projectJournalTags(
  tags: ReadonlyMap<string, TagRecord>,
  entries: readonly JournalEntry[],
): JournalTag[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const id of entry.tagIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const projected: JournalTag[] = [];
  for (const [id, entryCount] of counts) {
    const record = tags.get(id);
    if (record !== undefined) {
      projected.push({ id, name: record.name, color: record.color, entryCount });
    }
  }
  projected.sort(
    (left, right) =>
      right.entryCount - left.entryCount || left.name.localeCompare(right.name),
  );
  return projected;
}

export function entriesWithTag(
  entries: readonly JournalEntry[],
  tagId: string,
): JournalEntry[] {
  return entries.filter((entry) => entry.tagIds.includes(tagId));
}

/** Tag ids whose name matches a free-text query, so search follows relationships. */
export function tagIdsMatchingQuery(
  tags: readonly JournalTag[],
  query: string,
): ReadonlySet<string> {
  const matched = new Set<string>();
  for (const tag of tags) {
    if (tag.name.toLowerCase().includes(query)) {
      matched.add(tag.id);
    }
  }
  return matched;
}
