import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveJournalDateExpression } from "@skriuw/renderer-core/journal/date-expressions";
import {
  monthGrid,
  monthOfKey,
  shiftMonthKeepingDay,
  shiftYearKeepingDay,
} from "@skriuw/renderer-core/journal/dates";
import { DAY_SWIPE_DISTANCE_PX, daySwipeStep } from "@/features/journal/day-swipe";
import { journalDayFromParam, journalDayHref, stepJournalDay } from "@/features/journal/navigation";
import { FIXTURE_TODAY } from "./journal-fixture";

const CONTEXT = "2026-09-15";

function resolved(input: string, context = CONTEXT): string {
  const outcome = resolveJournalDateExpression(input, context, FIXTURE_TODAY);
  return outcome.ok ? `${outcome.key} ${outcome.granularity}` : `error: ${outcome.message}`;
}

test("every step keeps the day of the month and clamps to shorter ones", () => {
  assert.equal(
    stepJournalDay("2026-09-15", { unit: "day", amount: -1 }, FIXTURE_TODAY),
    "2026-09-14",
  );
  assert.equal(
    stepJournalDay("2026-09-15", { unit: "week", amount: 1 }, FIXTURE_TODAY),
    "2026-09-22",
  );
  assert.equal(
    stepJournalDay("2026-01-31", { unit: "month", amount: 1 }, FIXTURE_TODAY),
    "2026-02-28",
  );
  assert.equal(
    stepJournalDay("2024-02-29", { unit: "year", amount: 1 }, FIXTURE_TODAY),
    "2025-02-28",
  );
  assert.equal(stepJournalDay("2026-01-01", { unit: "today" }, FIXTURE_TODAY), FIXTURE_TODAY);
  assert.equal(shiftMonthKeepingDay("2028-01-31", 1), "2028-02-29");
  assert.equal(shiftYearKeepingDay("2024-02-29", -1), "2023-02-28");
});

test("the route parameter carries the day and falls back to today", () => {
  assert.equal(journalDayFromParam("2026-09-15"), CONTEXT);
  assert.equal(journalDayFromParam(["2026-09-15", "2026-01-01"]), CONTEXT);
  assert.equal(journalDayFromParam("2026-02-30").length, 10);
  assert.equal(journalDayFromParam(undefined).length, 10);
  assert.equal(journalDayHref("2026-09-15"), "/journal?day=2026-09-15");
});

test("the month grid is whole Monday-first weeks around its month", () => {
  const grid = monthGrid(monthOfKey("2026-09-15"));

  assert.equal(grid.length % 7, 0);
  assert.equal(grid[0]?.key, "2026-08-31");
  assert.equal(grid.filter((day) => day.inMonth).length, 30);
});

test("a horizontal drag steps a day and a vertical one steps nowhere", () => {
  const start = { x: 0, y: 0, edge: null };

  assert.equal(daySwipeStep(start, DAY_SWIPE_DISTANCE_PX, 0), -1);
  assert.equal(daySwipeStep(start, -DAY_SWIPE_DISTANCE_PX, 0), 1);
  assert.equal(daySwipeStep(start, DAY_SWIPE_DISTANCE_PX - 1, 0), 0);
  assert.equal(daySwipeStep(start, 8, 120), 0);
});

test("numbers read as the grammar specifies", () => {
  assert.equal(resolved("7"), "2026-09-07 day");
  assert.equal(resolved("312"), "2026-03-12 day");
  assert.equal(resolved("0312"), "2026-03-12 day");
  assert.equal(resolved("1231"), "2026-12-31 day");
  assert.equal(resolved("2025"), "2025-01-01 year");
  assert.equal(resolved("20251203"), "2025-12-03 day");
  assert.equal(resolved("3/12"), "2026-03-12 day");
  assert.equal(resolved("12/2025"), "2025-12-01 month");
  assert.equal(resolved("2-12-2025"), "2025-12-02 day");
  assert.equal(resolved("2025-12-02"), "2025-12-02 day");
});

test("two-digit years land in the hundred years ending twenty years out", () => {
  assert.equal(resolved("2-12-25"), "2025-12-02 day");
  assert.equal(resolved("2-12-70"), "1970-12-02 day");
});

test("words resolve against the viewed day, and anchors against today", () => {
  assert.equal(resolved("today"), `${FIXTURE_TODAY} day`);
  assert.equal(resolved("yesterday"), "2026-09-19 day");
  assert.equal(resolved("thu"), "2026-09-17 day");
  assert.equal(resolved("next week thursday"), "2026-09-24 day");
  assert.equal(resolved("next thu"), "2026-09-24 day");
  assert.equal(resolved("last friday"), "2026-09-11 day");
  assert.equal(resolved("3 days ago"), "2026-09-12 day");
  assert.equal(resolved("in 3 days"), "2026-09-18 day");
  assert.equal(resolved("next month"), "2026-10-15 day");
  assert.equal(resolved("december"), "2026-12-01 month");
  assert.equal(resolved("next march"), "2027-03-01 month");
  assert.equal(resolved("dec 12"), "2026-12-12 day");
  assert.equal(resolved("12 december 2025"), "2025-12-12 day");
  assert.equal(resolved("dec 2025"), "2025-12-01 month");
});

test("impossible and out-of-range dates come back as messages, never rolled over", () => {
  assert.match(resolved("2/30"), /^error:/);
  assert.match(resolved("2025-02-29"), /^error:/);
  assert.match(resolved("0999-01-01"), /^error:/);
  assert.match(resolved("in 99999 years"), /^error:/);
  assert.match(resolved("1899"), /^error:/);
  assert.match(resolved("1/1/202"), /^error:/);
  assert.match(resolved(""), /^error:/);
});
