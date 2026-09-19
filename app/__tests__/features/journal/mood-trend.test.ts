import assert from "node:assert/strict";
import test from "node:test";
import {
  dominantMood,
  moodBarLevel,
  moodTrend,
  moodTrendSummary,
} from "../../../src/features/journal/mood-trend";
import type { JournalEntry, MoodLevel } from "../../../src/features/journal/model";

function entry(dateKey: string, mood: MoodLevel | null, wordCount = 10): JournalEntry {
  return { noteId: `note-${dateKey}`, dateKey, title: dateKey, mood, wordCount, tagIds: [] };
}

test("moodTrend spans the window oldest first and keeps gaps visible", () => {
  const trend = moodTrend([entry("2026-09-18", "good"), entry("2026-09-16", null)], "2026-09-18", 4);
  assert.deepEqual(
    trend.days.map((day) => [day.dateKey, day.mood, day.hasEntry]),
    [
      ["2026-09-15", null, false],
      ["2026-09-16", null, true],
      ["2026-09-17", null, false],
      ["2026-09-18", "good", true],
    ],
  );
  assert.equal(trend.ratedDays, 1);
  assert.equal(trend.counts.good, 1);
  assert.equal(trend.average, 1);
  assert.equal(trend.direction, null);
});

test("entries outside the window do not count", () => {
  const trend = moodTrend([entry("2026-08-01", "rough"), entry("2026-09-19", "great")], "2026-09-18", 30);
  assert.equal(trend.ratedDays, 0);
  assert.equal(trend.average, null);
  assert.equal(moodTrendSummary(trend), "No moods logged yet");
  assert.equal(dominantMood(trend), null);
});

test("direction compares the two halves once each holds two rated days", () => {
  const up = moodTrend(
    [entry("2026-09-11", "low"), entry("2026-09-12", "rough"), entry("2026-09-17", "good"), entry("2026-09-18", "great")],
    "2026-09-18",
    8,
  );
  assert.equal(up.direction, "up");
  assert.equal(moodTrendSummary(up), "Mostly neutral, lifting lately");
  const down = moodTrend(
    [entry("2026-09-11", "great"), entry("2026-09-12", "good"), entry("2026-09-17", "low"), entry("2026-09-18", "rough")],
    "2026-09-18",
    8,
  );
  assert.equal(down.direction, "down");
  assert.equal(moodTrendSummary(down), "Mostly neutral, dipping lately");
  const steady = moodTrend(
    [entry("2026-09-11", "good"), entry("2026-09-12", "good"), entry("2026-09-17", "good"), entry("2026-09-18", "good")],
    "2026-09-18",
    8,
  );
  assert.equal(steady.direction, "steady");
  assert.equal(moodTrendSummary(steady), "Mostly good, holding steady");
  const sparse = moodTrend([entry("2026-09-11", "rough"), entry("2026-09-18", "great")], "2026-09-18", 8);
  assert.equal(sparse.direction, null);
  assert.equal(moodTrendSummary(sparse), "Mostly neutral");
});

test("bar levels step from rough to great", () => {
  assert.deepEqual(
    (["rough", "low", "neutral", "good", "great"] as const).map(moodBarLevel),
    [0.2, 0.4, 0.6, 0.8, 1],
  );
});
