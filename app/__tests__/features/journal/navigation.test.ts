import assert from "node:assert/strict";
import test from "node:test";
import { todayKey } from "../../../src/features/journal/dates";
import {
  currentJournalDay,
  openJournalDay,
  onJournalGoToDate,
  openJournalDayOffset,
  openJournalMonthOffset,
  openJournalToday,
  openJournalYearOffset,
  requestJournalGoToDate,
} from "../../../src/features/journal/navigation";

function withHash<T>(hash: string, run: () => T): { result: T; hash: string } {
  const previous = globalThis.window;
  const location = { hash };
  globalThis.window = { location } as unknown as Window & typeof globalThis;
  try {
    return { result: run(), hash: location.hash };
  } finally {
    globalThis.window = previous;
  }
}

test("currentJournalDay reads the focused day and falls back to today", () => {
  assert.equal(withHash("#/journal/2026-07-27", currentJournalDay).result, "2026-07-27");
  assert.equal(withHash("#/journal", currentJournalDay).result, todayKey());
  assert.equal(withHash("#/journal/not-a-date", currentJournalDay).result, todayKey());
  assert.equal(withHash("#/notes", currentJournalDay).result, todayKey());
});

test("day navigation writes the neighbouring day into the hash", () => {
  assert.equal(
    withHash("#/journal/2026-07-01", () => openJournalDayOffset(-1)).hash,
    "#/journal/2026-06-30",
  );
  assert.equal(
    withHash("#/journal/2026-12-31", () => openJournalDayOffset(1)).hash,
    "#/journal/2027-01-01",
  );
  assert.equal(
    withHash("#/journal/2026-07-27", () => openJournalDay("2026-01-05")).hash,
    "#/journal/2026-01-05",
  );
  assert.equal(
    withHash("#/journal/2026-07-27", openJournalToday).hash,
    `#/journal/${todayKey()}`,
  );
});

test("month and year steps keep the day and clamp to shorter months", () => {
  assert.equal(
    withHash("#/journal/2026-01-31", () => openJournalMonthOffset(1)).hash,
    "#/journal/2026-02-28",
  );
  assert.equal(
    withHash("#/journal/2026-03-15", () => openJournalMonthOffset(-3)).hash,
    "#/journal/2025-12-15",
  );
  assert.equal(
    withHash("#/journal/2024-02-29", () => openJournalYearOffset(1)).hash,
    "#/journal/2025-02-28",
  );
  assert.equal(
    withHash("#/journal/2024-02-29", () => openJournalYearOffset(-4)).hash,
    "#/journal/2020-02-29",
  );
});

test("a go-to-date request reaches every registered listener until it unsubscribes", () => {
  const previous = globalThis.window;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  try {
    let opened = 0;
    const unsubscribe = onJournalGoToDate(() => {
      opened += 1;
    });
    requestJournalGoToDate();
    unsubscribe();
    requestJournalGoToDate();
    assert.equal(opened, 1);
  } finally {
    globalThis.window = previous;
  }
});
