import assert from "node:assert/strict";
import { test } from "vitest";
import {
  JOURNAL_DATE_SUGGESTIONS,
  expandTwoDigitYear,
  resolveJournalDateExpression,
  type JournalDateGranularity,
} from "@skriuw/renderer-core/journal/date-expressions";

const TODAY = "2026-09-15";
const CONTEXT = "2026-09-15";

function resolve(input: string, context = CONTEXT, today = TODAY) {
  return resolveJournalDateExpression(input, context, today);
}

function expectKey(
  input: string,
  key: string,
  granularity: JournalDateGranularity = "day",
  context = CONTEXT,
  today = TODAY,
): void {
  const result = resolve(input, context, today);
  assert.ok(result.ok, `${input} failed: ${result.ok ? "" : result.message}`);
  assert.equal(result.key, key, input);
  assert.equal(result.granularity, granularity, input);
}

function expectInvalid(input: string, pattern?: RegExp, context = CONTEXT): string {
  const result = resolve(input, context);
  assert.equal(result.ok, false, `${input} should be rejected`);
  const message = result.ok ? "" : result.message;
  if (pattern) {
    assert.match(message, pattern, input);
  }
  return message;
}

test("the original request's examples resolve", () => {
  expectKey("next week thursday", "2026-09-24");
  expectKey("312", "2026-03-12");
  expectKey("dec 2025", "2025-12-01", "month");
  expectKey("3/12", "2026-03-12");
  expectKey("2-12-2025", "2025-12-02");
});

test("numeric layouts", () => {
  expectKey("0312", "2026-03-12");
  expectKey("7", "2026-09-07");
  expectKey("07", "2026-09-07");
  expectKey("2025-12-02", "2025-12-02");
  expectKey("2025/12/2", "2025-12-02");
  expectKey("20251203", "2025-12-03");
  expectKey("2025", "2025-01-01", "year");
  expectKey("12/2025", "2025-12-01", "month");
  expectKey("2025-12", "2025-12-01", "month");
  expectKey("2.12.2025", "2025-12-02");
  expectKey("1231", "2026-12-31");
});

test("two-part numbers are month/day and three-part are day/month/year", () => {
  expectKey("12/3", "2026-12-03");
  expectKey("12/3/2026", "2026-03-12");
});

test("anchors use the real today while relative terms use the viewed day", () => {
  const context = "2026-01-10";
  expectKey("today", TODAY, "day", context);
  expectKey("now", TODAY, "day", context);
  expectKey("yesterday", "2026-09-14", "day", context);
  expectKey("tomorrow", "2026-09-16", "day", context);
  expectKey("next day", "2026-01-11", "day", context);
  expectKey("3 days ago", "2026-01-07", "day", context);
  expectKey("in 2 weeks", "2026-01-24", "day", context);
  expectKey("next month", "2026-02-10", "day", context);
  expectKey("last year", "2025-01-10", "day", context);
  expectKey("jan 5", "2026-01-05", "day", context);
});

test("weekdays name the day in the viewed week, next and last move a whole week", () => {
  const tuesday = "2026-09-15";
  expectKey("thu", "2026-09-17", "day", tuesday);
  expectKey("this thu", "2026-09-17", "day", tuesday);
  expectKey("mon", "2026-09-14", "day", tuesday);
  expectKey("next thu", "2026-09-24", "day", tuesday);
  expectKey("next thursday", resolveKey("next week thursday", tuesday), "day", tuesday);
  expectKey("last thu", "2026-09-10", "day", tuesday);
  expectKey("last week thursday", "2026-09-10", "day", tuesday);
  expectKey("next mon", "2026-09-21", "day", tuesday);
  expectKey("last sun", "2026-09-13", "day", tuesday);
  expectKey("tues", "2026-09-15", "day", tuesday);
  expectKey("weds", "2026-09-16", "day", tuesday);
  expectKey("next sunday", "2026-09-27", "day", "2026-09-20");
});

function resolveKey(input: string, context: string): string {
  const result = resolve(input, context);
  assert.ok(result.ok);
  return result.key;
}

test("month names resolve with an optional day and year in either order", () => {
  expectKey("december", "2026-12-01", "month");
  expectKey("dec 12", "2026-12-12");
  expectKey("12 dec", "2026-12-12");
  expectKey("december 12 2025", "2025-12-12");
  expectKey("12 december 2025", "2025-12-12");
  expectKey("2025 dec", "2025-12-01", "month");
  expectKey("next march", "2027-03-01", "month");
  expectKey("last march", "2026-03-01", "month");
  expectKey("next december", "2026-12-01", "month");
  expectKey("last september", "2025-09-01", "month");
  expectKey("this march", "2026-03-01", "month");
  expectInvalid("dec 12 13", /too many parts/);
  expectInvalid("feb 30", /February 30 isn't a real date in 2026/);
});

test("prefixes need three letters and must be unambiguous", () => {
  expectKey("sept", "2026-09-01", "month");
  expectInvalid("ju");
  expectInvalid("t");
});

test("month and year steps clamp to the end of shorter months", () => {
  expectKey("next month", "2026-02-28", "day", "2026-01-31");
  expectKey("in 1 month", "2024-02-29", "day", "2024-01-31");
  expectKey("next year", "2025-02-28", "day", "2024-02-29");
  expectKey("last year", "2023-02-28", "day", "2024-02-29");
});

test("impossible dates are rejected rather than rolled over", () => {
  expectInvalid("2/30", /February 30/);
  expectInvalid("13/1", /no month 13/);
  expectInvalid("2025-02-29", /February 29 isn't a real date in 2025/);
  expectKey("2024-02-29", "2024-02-29");
  expectInvalid("0/2025", /no month 0/);
  expectInvalid("13/2025", /no month 13/);
});

test("years outside the supported range return a message instead of throwing", () => {
  for (const input of [
    "1/1/202",
    "1/1/20255",
    "0999-01-01",
    "0025-01-01",
    "09990101",
    "12/0999",
    "dec 0999",
    "dec 12 0999",
    "in 99999 years",
    "99999999999 days ago",
  ]) {
    assert.doesNotThrow(() => resolve(input), input);
    assert.equal(resolve(input).ok, false, input);
  }
  expectInvalid("1/1/202", /two or four digits/);
  expectInvalid("0999-01-01", /Year 0999 is outside the journal's range of 1000–9999/);
  expectInvalid("0025-01-01", /Year 0025 is outside/);
  expectInvalid("12/0999", /Year 0999 is outside/);
  expectInvalid("09990101", /Year 0999 is outside/);
  expectInvalid("in 99999 years", /outside the journal's range/);
  expectKey("1850-06-01", "1850-06-01");
  expectKey("jan 1850", "1850-01-01", "month");
});

test("a bare four-digit run outside the year span explains both readings", () => {
  expectInvalid("1899", /month and day like 0312, or a year from 1900 to 2999/);
  expectKey("1900", "1900-01-01", "year");
  expectKey("2999", "2999-01-01", "year");
});

test("two-digit years fall in the hundred years ending twenty years after today", () => {
  assert.equal(expandTwoDigitYear(25, "2026-09-15"), 2025);
  assert.equal(expandTwoDigitYear(46, "2026-09-15"), 2046);
  assert.equal(expandTwoDigitYear(47, "2026-09-15"), 1947);
  assert.equal(expandTwoDigitYear(99, "2026-09-15"), 1999);
  assert.equal(expandTwoDigitYear(0, "2026-09-15"), 2000);
  assert.equal(expandTwoDigitYear(90, "2085-01-01"), 2090);
  assert.equal(expandTwoDigitYear(10, "2085-01-01"), 2010);
  assert.equal(expandTwoDigitYear(5, "2085-01-01"), 2105);
  expectKey("2-12-25", "2025-12-02");
  expectKey("2-12-70", "1970-12-02");
});

test("garbage and empty input are rejected with guidance", () => {
  expectInvalid("", /Type a date/);
  expectInvalid("   ", /Type a date/);
  expectInvalid("banana", /“banana” isn't a date/);
  expectInvalid("123456", /doesn't look like a date/);
  expectInvalid("1/2/3/4", /too many parts/);
  expectInvalid("next banana");
  expectInvalid("in x days");
});

test("labels name the destination at its granularity", () => {
  const day = resolve("2025-12-02");
  assert.ok(day.ok);
  assert.equal(day.label, "Tuesday, December 2, 2025");
  const month = resolve("dec 2025");
  assert.ok(month.ok);
  assert.equal(month.label, "December 2025");
  const year = resolve("2025");
  assert.ok(year.ok);
  assert.equal(year.label, "2025");
});

test("input is case- and whitespace-insensitive", () => {
  expectKey("  NEXT   Week  Thursday ", "2026-09-24");
});

test("every suggestion resolves", () => {
  assert.ok(JOURNAL_DATE_SUGGESTIONS.length > 0);
  for (const suggestion of JOURNAL_DATE_SUGGESTIONS) {
    assert.equal(resolve(suggestion.expression).ok, true, suggestion.expression);
  }
});
