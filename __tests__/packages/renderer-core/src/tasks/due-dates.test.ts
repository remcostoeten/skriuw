import assert from "node:assert/strict";
import { test } from "vitest";
import {
  daysLate,
  describeDueDate,
  dueBucket,
  dueQuickPicks,
  formatDueLabel,
  isDueDate,
  nextWeekStart,
  resolveDueExpression,
  thisWeekend,
} from "@skriuw/renderer-core/tasks/due-dates";

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

test("the date popover's words resolve against today", () => {
  const sunday = "2026-11-08";
  assert.equal(resolveDueExpression("tod", sunday), sunday);
  assert.equal(resolveDueExpression("tom", sunday), "2026-11-09");
  assert.equal(resolveDueExpression("tmr", sunday), "2026-11-09");
  assert.equal(resolveDueExpression("+3", sunday), "2026-11-11");
  assert.equal(resolveDueExpression("+2w", sunday), "2026-11-22");
  assert.equal(resolveDueExpression("+10 days", sunday), "2026-11-18");
  assert.equal(resolveDueExpression("fri", sunday), "2026-11-13");
  assert.equal(resolveDueExpression("20 nov", sunday), "2026-11-20");
  assert.equal(resolveDueExpression("Nov 20", sunday), "2026-11-20");
  assert.equal(resolveDueExpression("2026-12-24", sunday), "2026-12-24");
});

test("next week means next Monday, and never tomorrow", () => {
  assert.equal(resolveDueExpression("next week", "2026-11-04"), "2026-11-09");
  assert.equal(resolveDueExpression("next_week", "2026-11-08"), "2026-11-16");
  assert.equal(nextWeekStart("2026-11-09"), "2026-11-16");
});

test("this weekend is the coming Saturday, or today during the weekend", () => {
  assert.equal(thisWeekend("2026-11-04"), "2026-11-07");
  assert.equal(thisWeekend("2026-11-07"), "2026-11-07");
  assert.equal(thisWeekend("2026-11-08"), "2026-11-08");
  assert.equal(resolveDueExpression("weekend", "2026-11-04"), "2026-11-07");
});

test("a day and month long past means next year's", () => {
  assert.equal(resolveDueExpression("2 jan", "2026-11-08"), "2027-01-02");
  assert.equal(resolveDueExpression("20 oct", "2026-11-08"), "2026-10-20");
  assert.equal(resolveDueExpression("2026-01-02", "2026-11-08"), "2026-01-02");
});

test("quick picks offer today, tomorrow, the weekend, and next week", () => {
  assert.deepEqual(dueQuickPicks("2026-11-04"), [
    { label: "Today", dueDate: "2026-11-04" },
    { label: "Tomorrow", dueDate: "2026-11-05" },
    { label: "This weekend", dueDate: "2026-11-07" },
    { label: "Next week", dueDate: "2026-11-09" },
  ]);
});

test("lateness counts whole days past the due date", () => {
  assert.equal(daysLate("2026-09-27", TODAY), 3);
  assert.equal(daysLate(TODAY, TODAY), 0);
  assert.equal(daysLate("2026-10-02", TODAY), 0);
});
