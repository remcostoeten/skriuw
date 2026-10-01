import assert from "node:assert/strict";
import { test } from "vitest";
import {
  formatRecurrenceLabel,
  isRecurrence,
  nextOccurrence,
  normalizeRecurrence,
  resolveRecurrenceExpression,
} from "@/features/tasks/recurrence";

test("typed rules resolve to the canonical Obsidian Tasks spelling", () => {
  assert.equal(resolveRecurrenceExpression("week"), "every week");
  assert.equal(resolveRecurrenceExpression("weekly"), "every week");
  assert.equal(resolveRecurrenceExpression("daily"), "every day");
  assert.equal(resolveRecurrenceExpression("weekdays"), "every weekday");
  assert.equal(resolveRecurrenceExpression("2_weeks"), "every 2 weeks");
  assert.equal(resolveRecurrenceExpression("3months"), "every 3 months");
  assert.equal(resolveRecurrenceExpression("1_year"), "every year");
  assert.equal(resolveRecurrenceExpression("fortnight"), null);
  assert.equal(resolveRecurrenceExpression("0_days"), null);
  assert.equal(resolveRecurrenceExpression("1000_days"), null);
});

test("Markdown rules normalize regardless of case and spacing", () => {
  assert.equal(normalizeRecurrence("Every  Week"), "every week");
  assert.equal(normalizeRecurrence("every 2 weeks"), "every 2 weeks");
  assert.equal(normalizeRecurrence("every week on Sunday"), null);
  assert.equal(normalizeRecurrence("weekly"), null);
});

test("only canonical spellings are stored rules", () => {
  assert.ok(isRecurrence("every 2 weeks"));
  assert.ok(isRecurrence("every weekday"));
  assert.ok(!isRecurrence("every 1 week"));
  assert.ok(!isRecurrence("Every week"));
  assert.ok(!isRecurrence(42));
});

test("the next occurrence counts from the given day", () => {
  assert.equal(nextOccurrence("every day", "2026-12-31"), "2027-01-01");
  assert.equal(nextOccurrence("every week", "2026-10-01"), "2026-10-08");
  assert.equal(nextOccurrence("every 2 weeks", "2026-10-01"), "2026-10-15");
  assert.equal(nextOccurrence("every month", "2026-10-15"), "2026-11-15");
  assert.equal(nextOccurrence("every year", "2026-10-01"), "2027-10-01");
});

test("months and years clamp to the last day of a shorter month", () => {
  assert.equal(nextOccurrence("every month", "2026-01-31"), "2026-02-28");
  assert.equal(nextOccurrence("every month", "2028-01-31"), "2028-02-29");
  assert.equal(nextOccurrence("every year", "2028-02-29"), "2029-02-28");
});

test("weekday repeats skip the weekend", () => {
  assert.equal(nextOccurrence("every weekday", "2026-10-01"), "2026-10-02");
  assert.equal(nextOccurrence("every weekday", "2026-10-02"), "2026-10-05");
  assert.equal(nextOccurrence("every weekday", "2026-10-03"), "2026-10-05");
  assert.equal(nextOccurrence("every weekday", "2026-10-04"), "2026-10-05");
});

test("an unknown rule or day has no next occurrence", () => {
  assert.equal(nextOccurrence("every fortnight", "2026-10-01"), null);
  assert.equal(nextOccurrence("every week", "2026-02-30"), null);
});

test("chips read as short adverbs", () => {
  assert.equal(formatRecurrenceLabel("every day"), "Daily");
  assert.equal(formatRecurrenceLabel("every week"), "Weekly");
  assert.equal(formatRecurrenceLabel("every weekday"), "Weekdays");
  assert.equal(formatRecurrenceLabel("every 3 days"), "Every 3 days");
});
