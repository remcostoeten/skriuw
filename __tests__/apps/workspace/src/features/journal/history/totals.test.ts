import assert from "node:assert/strict";
import { test } from "vitest";
import type { JournalEntry } from "@/features/journal/model";
import { groupEntriesByMonth, journalTotals } from "@/features/journal/history/totals";

function entry(dateKey: string, wordCount = 100): JournalEntry {
  return {
    noteId: `note-${dateKey}`,
    dateKey,
    title: "Untitled",
    mood: null,
    wordCount,
    tagIds: [],
  };
}

test("journalTotals counts entries, words, the streak and the month", () => {
  const entries = [
    entry("2026-11-08", 10),
    entry("2026-11-07", 20),
    entry("2026-11-05", 30),
    entry("2026-10-30", 45),
  ];
  assert.deepEqual(journalTotals(entries, null, "2026-11-08"), {
    entries: 4,
    words: 105,
    streak: 2,
    thisMonth: 3,
    goalDays: null,
    goalStreak: null,
  });
});

test("journalTotals carries goal figures only when a goal has been set", () => {
  const stats = { metDays: 3, streak: 2, metDates: new Set<string>() };
  const totals = journalTotals([entry("2026-11-08")], stats, "2026-11-08");
  assert.equal(totals.goalDays, 3);
  assert.equal(totals.goalStreak, 2);
});

test("journalTotals keeps yesterday's streak while today is empty", () => {
  const totals = journalTotals([entry("2026-11-07"), entry("2026-11-06")], null, "2026-11-08");
  assert.equal(totals.streak, 2);
});

test("groupEntriesByMonth splits newest first entries by month and keeps order", () => {
  const groups = groupEntriesByMonth(
    ["2026-11-08", "2026-11-01", "2026-10-31", "2025-11-08"].map((key) => entry(key)),
  );
  assert.deepEqual(
    groups.map((group) => [
      group.month.year,
      group.month.month,
      group.entries.map((item) => item.dateKey),
    ]),
    [
      [2026, 10, ["2026-11-08", "2026-11-01"]],
      [2026, 9, ["2026-10-31"]],
      [2025, 10, ["2025-11-08"]],
    ],
  );
});

test("groupEntriesByMonth returns nothing for no entries", () => {
  assert.deepEqual(groupEntriesByMonth([]), []);
});
