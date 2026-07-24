import assert from "node:assert/strict";
import test from "node:test";
import { formatRelativeTime } from "../../../src/shared/lib/relative-time";

const NOW = Date.UTC(2026, 6, 24, 12, 0, 0);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

test("formats a few seconds ago", () => {
  assert.equal(formatRelativeTime(NOW - 5 * SECOND, NOW), "5 seconds ago");
});

test("formats minutes ago", () => {
  assert.equal(formatRelativeTime(NOW - 3 * MINUTE, NOW), "3 minutes ago");
});

test("formats hours ago", () => {
  assert.equal(formatRelativeTime(NOW - 2 * HOUR, NOW), "2 hours ago");
});

test("formats three days ago", () => {
  assert.equal(formatRelativeTime(NOW - 3 * DAY, NOW), "3 days ago");
});

test("formats weeks, months, years ago", () => {
  assert.ok(formatRelativeTime(NOW - 2 * WEEK, NOW).includes("week"));
  assert.ok(formatRelativeTime(NOW - 2 * MONTH, NOW).includes("month"));
  assert.ok(formatRelativeTime(NOW - 2 * YEAR, NOW).includes("year"));
});

test("formats future timestamps", () => {
  assert.equal(formatRelativeTime(NOW + 2 * HOUR, NOW), "in 2 hours");
});
