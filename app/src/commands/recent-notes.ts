import type { NoteMetadata } from "@/store/types";

export type RecentNote = {
  id: string;
  title: string;
  updatedAt: number;
};

const MAX_RECENTS = 10;

/**
 * The most recently updated notes, newest first, capped at `max`. Journal
 * entries never appear because `noteIds` already excludes them.
 */
export function recentNotes(
  noteIds: readonly string[],
  metadata: ReadonlyMap<string, NoteMetadata>,
  max: number = MAX_RECENTS,
): RecentNote[] {
  const recents: RecentNote[] = [];
  for (const id of noteIds) {
    const meta = metadata.get(id);
    if (meta === undefined) {
      continue;
    }
    recents.push({ id, title: meta.title, updatedAt: meta.updatedAt });
  }
  recents.sort((left, right) => right.updatedAt - left.updatedAt);
  return recents.slice(0, max);
}

/**
 * Formats a note's age as a terse badge: "now", "5m", "3h", "2d", "4w", "6mo",
 * "1y".
 */
export function compactAge(updatedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - updatedAt) / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)}mo`;
  }
  return `${Math.floor(days / 365)}y`;
}
