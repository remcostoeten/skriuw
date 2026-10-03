import {
  dateKeyOf,
  parseDateKey,
  todayKey,
  type DateKey,
} from "@skriuw/renderer-core/journal/dates";

/**
 * @name currentStreak
 * @description The run of consecutive entry days ending today, or ending
 * yesterday when today has no entry yet.
 *
 * @example
 * currentStreak(new Set(["2026-03-09", "2026-03-10"]), "2026-03-10"); // 2
 */
export function currentStreak(
  entryDates: ReadonlySet<DateKey>,
  today: DateKey = todayKey(),
): number {
  const cursor = parseDateKey(today);
  if (!entryDates.has(dateKeyOf(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (entryDates.has(dateKeyOf(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
