import type { TrashRow, TrashSortKey } from "@skriuw/renderer-core/store/trash";

export type TrashGroupId = "today" | "yesterday" | "week" | "month" | "older" | "all";

export type TrashGroup = {
  id: TrashGroupId;
  title: string;
  hint: string;
  rows: readonly TrashRow[];
};

const DAY_MS = 86_400_000;

const AGE_TITLES: Record<Exclude<TrashGroupId, "all">, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  month: "Last 30 days",
  older: "Older",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function ageGroup(deletedAt: number, startOfToday: number): Exclude<TrashGroupId, "all"> {
  if (deletedAt >= startOfToday) return "today";
  if (deletedAt >= startOfToday - DAY_MS) return "yesterday";
  if (deletedAt >= startOfToday - 7 * DAY_MS) return "week";
  if (deletedAt >= startOfToday - 30 * DAY_MS) return "month";
  return "older";
}

/**
 * @name summarizeTrashKinds
 * @description Counts the notes and folders in a set of trash rows as one
 * short phrase, leaving out a kind that has none.
 *
 * @example
 * summarizeTrashKinds(rows); // "5 notes, 1 folder"
 */
export function summarizeTrashKinds(rows: readonly TrashRow[]): string {
  const folders = rows.filter((row) => row.kind === "folder").length;
  const notes = rows.length - folders;
  return [notes > 0 ? plural(notes, "note") : null, folders > 0 ? plural(folders, "folder") : null]
    .filter(Boolean)
    .join(", ");
}

/**
 * @name groupTrashRows
 * @description Splits already sorted trash rows into ledger groups. Date sorts
 * group by how long ago an item was deleted, in the order the rows arrive.
 * Title sorts keep one group, because age buckets would break the alphabet.
 *
 * @example
 * groupTrashRows(sortTrashRows(rows, "newest"), "newest", startOfToday);
 */
export function groupTrashRows(
  rows: readonly TrashRow[],
  sortKey: TrashSortKey,
  startOfToday: number,
): TrashGroup[] {
  if (rows.length === 0) return [];
  if (sortKey === "az" || sortKey === "za") {
    return [
      {
        id: "all",
        title: sortKey === "az" ? "A to Z" : "Z to A",
        hint: summarizeTrashKinds(rows),
        rows,
      },
    ];
  }
  const buckets = new Map<Exclude<TrashGroupId, "all">, TrashRow[]>();
  for (const row of rows) {
    const id = ageGroup(row.deletedAt, startOfToday);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(row);
    else buckets.set(id, [row]);
  }
  return [...buckets].map(([id, bucket]) => ({
    id,
    title: AGE_TITLES[id],
    hint: summarizeTrashKinds(bucket),
    rows: bucket,
  }));
}

/**
 * @name trashRowPreview
 * @description The second line of a trash row. A note shows its body without
 * the heading that repeats its title, a folder shows what it contains.
 *
 * @example
 * trashRowPreview({ ...row, title: "Math", snippet: "Math Write equations" }); // "Write equations"
 */
export function trashRowPreview(row: TrashRow): string {
  if (row.kind === "folder") return row.summary;
  const body = row.snippet.startsWith(`${row.title} `)
    ? row.snippet.slice(row.title.length + 1)
    : row.snippet === row.title
      ? ""
      : row.snippet;
  return body || "Empty note";
}

/**
 * @name trashNeighborId
 * @description The row that should take focus when `id` leaves the list: the
 * one after it, or the one before it at the end of the list.
 *
 * @example
 * trashNeighborId(["a", "b", "c"], "c"); // "b"
 */
export function trashNeighborId(ids: readonly string[], id: string): string | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}
