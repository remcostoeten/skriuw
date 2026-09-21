import assert from "node:assert/strict";
import test from "node:test";
import {
  dateKeyOf,
  formatDayHeading,
  isDateKey,
  monthGrid,
  monthOfKey,
  monthPrefix,
  calendarKeyMove,
  parseDateKey,
  shiftDay,
  shiftMonth,
  todayKey,
} from "../../../src/features/journal/dates";

test("date keys round-trip through parse and format", () => {
  assert.equal(dateKeyOf(new Date(2026, 6, 27)), "2026-07-27");
  const parsed = parseDateKey("2026-07-27");
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 6);
  assert.equal(parsed.getDate(), 27);
  assert.equal(dateKeyOf(parseDateKey("2024-02-29")), "2024-02-29");
});

test("isDateKey rejects malformed and impossible dates", () => {
  assert.ok(isDateKey("2026-01-31"));
  assert.ok(!isDateKey("2026-02-30"));
  assert.ok(!isDateKey("2026-13-01"));
  assert.ok(!isDateKey("2026-1-01"));
  assert.ok(!isDateKey("not-a-date"));
  assert.ok(!isDateKey(""));
});

test("todayKey matches dateKeyOf(now)", () => {
  assert.equal(todayKey(), dateKeyOf(new Date()));
});

test("monthGrid starts on Monday and covers whole weeks", () => {
  const grid = monthGrid({ year: 2026, month: 6 });
  assert.equal(grid.length % 7, 0);
  assert.equal(grid[0]?.key, "2026-06-29");
  assert.equal(parseDateKey(grid[0]!.key).getDay(), 1);
  const inMonth = grid.filter((day) => day.inMonth);
  assert.equal(inMonth.length, 31);
  assert.equal(inMonth[0]?.key, "2026-07-01");
  assert.equal(inMonth.at(-1)?.key, "2026-07-31");
});

test("monthGrid handles a month starting on Monday without a leading week", () => {
  const grid = monthGrid({ year: 2026, month: 5 });
  assert.equal(grid[0]?.key, "2026-06-01");
});

test("shiftMonth wraps across year boundaries", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
});

test("monthOfKey and monthPrefix agree", () => {
  const month = monthOfKey("2026-07-27");
  assert.deepEqual(month, { year: 2026, month: 6 });
  assert.equal(monthPrefix(month), "2026-07");
});

test("formatDayHeading names relative days and falls back to the weekday", () => {
  assert.equal(formatDayHeading("2026-07-27", "2026-07-27"), "Today");
  assert.equal(formatDayHeading("2026-07-26", "2026-07-27"), "Yesterday");
  assert.equal(formatDayHeading("2026-07-28", "2026-07-27"), "Tomorrow");
  assert.equal(formatDayHeading("2026-07-20", "2026-07-27"), "Monday");
});

test("shiftDay crosses month and year boundaries", () => {
  assert.equal(shiftDay("2026-07-31", 1), "2026-08-01");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDay("2026-07-27", 0), "2026-07-27");
});

test("calendarKeyMove steps by day, week, and month", () => {
  assert.equal(calendarKeyMove("2026-07-27", "ArrowLeft"), "2026-07-26");
  assert.equal(calendarKeyMove("2026-07-27", "ArrowRight"), "2026-07-28");
  assert.equal(calendarKeyMove("2026-07-27", "ArrowUp"), "2026-07-20");
  assert.equal(calendarKeyMove("2026-07-27", "ArrowDown"), "2026-08-03");
  assert.equal(calendarKeyMove("2026-07-27", "PageUp"), "2026-06-27");
  assert.equal(calendarKeyMove("2026-07-27", "PageDown"), "2026-08-27");
});

test("calendarKeyMove spans the Monday-first week with Home and End", () => {
  assert.equal(calendarKeyMove("2026-07-29", "Home"), "2026-07-27");
  assert.equal(calendarKeyMove("2026-07-29", "End"), "2026-08-02");
  assert.equal(calendarKeyMove("2026-07-26", "Home"), "2026-07-20");
});

test("calendarKeyMove clamps a month step onto a shorter month", () => {
  assert.equal(calendarKeyMove("2026-03-31", "PageUp"), "2026-02-28");
  assert.equal(calendarKeyMove("2026-01-31", "PageDown"), "2026-02-28");
});

test("calendarKeyMove ignores keys that are not grid movements", () => {
  assert.equal(calendarKeyMove("2026-07-27", "Enter"), null);
  assert.equal(calendarKeyMove("2026-07-27", "a"), null);
});
