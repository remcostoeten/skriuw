import { monthOfKey, type DateKey, type MonthKey } from "@skriuw/renderer-core/journal/dates";
import type { JournalEntry } from "../model";
import type { WordGoalStats } from "../word-goal";
import { currentStreak } from "./streak";

export type JournalTotals = {
  entries: number;
  words: number;
  streak: number;
  thisMonth: number;
  goalDays: number | null;
  goalStreak: number | null;
};

export type MonthGroup = {
  month: MonthKey;
  entries: JournalEntry[];
};

/**
 * @name journalTotals
 * @description Entry, word and streak totals over the projected entries. The
 * goal figures are null until a word goal has ever been set, so a journal that
 * never used goals never shows empty goal rows.
 *
 * @example
 * const totals = journalTotals(entries, goalStats, todayKey());
 */
export function journalTotals(
  entries: readonly JournalEntry[],
  goalStats: WordGoalStats | null,
  today: DateKey,
): JournalTotals {
  const month = today.slice(0, 7);
  return {
    entries: entries.length,
    words: entries.reduce((sum, entry) => sum + entry.wordCount, 0),
    streak: currentStreak(new Set(entries.map((entry) => entry.dateKey)), today),
    thisMonth: entries.filter((entry) => entry.dateKey.startsWith(month)).length,
    goalDays: goalStats === null ? null : goalStats.metDays,
    goalStreak: goalStats === null ? null : goalStats.streak,
  };
}

/**
 * @name groupEntriesByMonth
 * @description Splits entries that are already ordered newest first into one
 * group per calendar month, keeping that order inside each group.
 *
 * @example
 * groupEntriesByMonth(entries).map((group) => group.entries.length);
 */
export function groupEntriesByMonth(entries: readonly JournalEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const month = monthOfKey(entry.dateKey);
    const last = groups.at(-1);
    if (last !== undefined && last.month.year === month.year && last.month.month === month.month) {
      last.entries.push(entry);
    } else {
      groups.push({ month, entries: [entry] });
    }
  }
  return groups;
}
