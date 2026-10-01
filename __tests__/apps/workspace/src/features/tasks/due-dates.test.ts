import assert from "node:assert/strict";
import { test } from "vitest";
import {
  describeDueDate,
  dueBucket,
  formatDueLabel,
  isDueDate,
  resolveDueExpression,
} from "@/features/tasks/due-dates";

const TODAY = "2026-09-30";

test("a due date is a real calendar day in YYYY-MM-DD form", () => {
  assert.equal(isDueDate("2026-10-01"), true);
  assert.equal(isDueDate("2026-02-30"), false);
  assert.equal(isDueDate("2026-10-1"), false);
  assert.equal(isDueDate(null), false);
});

test("typed expressions resolve against today", () => {
  assert.equal(resolveDueExpression("2026-10-12", TODAY), "2026-10-12");
  assert.equal(resolveDueExpression("today", TODAY), TODAY);
  assert.equal(resolveDueExpression("Tomorrow", TODAY), "2026-10-01");
  assert.equal(resolveDueExpression("next_friday", TODAY), "2026-10-09");
  assert.equal(resolveDueExpression("in_3_days", TODAY), "2026-10-03");
});

test("a bare weekday means its next occurrence, never a past day", () => {
  assert.equal(resolveDueExpression("wednesday", TODAY), TODAY);
  assert.equal(resolveDueExpression("fri", TODAY), "2026-10-02");
  assert.equal(resolveDueExpression("tuesday", TODAY), "2026-10-06");
});

test("expressions that name no single day are refused", () => {
  assert.equal(resolveDueExpression("dec_2026", TODAY), null);
  assert.equal(resolveDueExpression("soon", TODAY), null);
  assert.equal(resolveDueExpression("", TODAY), null);
});

test("buckets split open and completed work around today", () => {
  assert.equal(dueBucket(null, false, TODAY), "none");
  assert.equal(dueBucket("2026-09-29", false, TODAY), "overdue");
  assert.equal(dueBucket("2026-09-29", true, TODAY), "earlier");
  assert.equal(dueBucket(TODAY, true, TODAY), "today");
  assert.equal(dueBucket("2026-10-01", false, TODAY), "upcoming");
});

test("chip labels are relative near today and absolute further out", () => {
  assert.equal(formatDueLabel(TODAY, TODAY), "Today");
  assert.equal(formatDueLabel("2026-10-01", TODAY), "Tomorrow");
  assert.equal(formatDueLabel("2026-09-29", TODAY), "Yesterday");
  assert.equal(formatDueLabel("2026-10-03", TODAY), "Sat");
  assert.equal(formatDueLabel("2026-11-12", TODAY), "Nov 12");
  assert.equal(formatDueLabel("2027-01-04", TODAY), "Jan 4, 2027");
});

test("the spoken description says when a date has passed", () => {
  assert.equal(
    describeDueDate("2026-09-01", false, TODAY),
    "Overdue, due Tuesday, September 1, 2026",
  );
  assert.equal(describeDueDate("2026-09-01", true, TODAY), "Due Tuesday, September 1, 2026");
});
