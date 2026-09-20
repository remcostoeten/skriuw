import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialState,
  createRendererStore,
} from "../../../../../shared/renderer-core/src/store/store";
import type { RendererState } from "../../../../../shared/renderer-core/src/store/types";
import {
  journalNoteIdForDate,
  selectEntryDateKeys,
  selectJournalEntries,
} from "../model";
import { dominantMood, moodTrend, moodTrendSummary } from "../mood-trend";
import { entryExcerpt, onThisDay } from "../on-this-day";
import {
  FIXTURE_EMPTY_DAY,
  FIXTURE_ENTRIES,
  FIXTURE_TODAY,
  fixtureNoteId,
  journalSnapshot,
} from "./journal-fixture.cjs";

function fixtureState(): RendererState {
  return createRendererStore(createInitialState(journalSnapshot())).getState();
}

test("entries project newest day first and skip days that were only opened", () => {
  const entries = selectJournalEntries(fixtureState());

  assert.equal(entries.length, FIXTURE_ENTRIES.length);
  assert.deepEqual(
    entries.map((entry) => entry.dateKey),
    [...FIXTURE_ENTRIES.map((entry) => entry.dateKey)].sort((left, right) =>
      right.localeCompare(left),
    ),
  );
  assert.equal(
    entries.some((entry) => entry.dateKey === FIXTURE_EMPTY_DAY),
    false,
  );
});

test("a day with a mood and no words still counts, matching the calendar rule", () => {
  const entries = selectJournalEntries(fixtureState());
  const moodOnly = entries.find((entry) => entry.dateKey === "2026-09-12");

  assert.equal(moodOnly?.mood, "good");
  assert.equal(moodOnly?.wordCount, 0);
});

test("the calendar dots are exactly the days with substance", () => {
  const dots = selectEntryDateKeys(fixtureState());

  assert.equal(dots.size, FIXTURE_ENTRIES.length);
  assert.equal(dots.has(FIXTURE_EMPTY_DAY), false);
  for (const entry of FIXTURE_ENTRIES) {
    assert.ok(dots.has(entry.dateKey), `missing dot for ${entry.dateKey}`);
  }
});

test("an opened but unwritten day still resolves to the note it created", () => {
  const state = fixtureState();

  assert.equal(journalNoteIdForDate(state, FIXTURE_EMPTY_DAY), fixtureNoteId(FIXTURE_EMPTY_DAY));
  assert.equal(journalNoteIdForDate(state, "2026-01-01"), null);
});

test("the projection keeps its identity while the maps it reads are unchanged", () => {
  const store = createRendererStore(createInitialState(journalSnapshot()));

  assert.equal(
    selectJournalEntries(store.getState()),
    selectJournalEntries(store.getState()),
  );
});

test("the thirty-day mood trend counts, averages and reads the same as the desktop strip", () => {
  const trend = moodTrend(selectJournalEntries(fixtureState()), FIXTURE_TODAY);

  assert.equal(trend.days.length, 30);
  assert.equal(trend.days[0]?.dateKey, "2026-08-22");
  assert.equal(trend.days[29]?.dateKey, FIXTURE_TODAY);
  assert.deepEqual(trend.counts, { great: 2, good: 3, neutral: 2, low: 2, rough: 1 });
  assert.equal(trend.ratedDays, 10);
  assert.equal(trend.average, 0.3);
  assert.equal(trend.direction, "steady");
  assert.equal(dominantMood(trend), "neutral");
  assert.equal(moodTrendSummary(trend), "Mostly neutral, holding steady");
});

test("a written day without a mood keeps its place in the strip", () => {
  const trend = moodTrend(selectJournalEntries(fixtureState()), FIXTURE_TODAY);
  const unrated = trend.days.find((day) => day.dateKey === "2026-09-18");
  const missing = trend.days.find((day) => day.dateKey === FIXTURE_EMPTY_DAY);

  assert.deepEqual(unrated, { dateKey: "2026-09-18", mood: null, hasEntry: true });
  assert.deepEqual(missing, { dateKey: FIXTURE_EMPTY_DAY, mood: null, hasEntry: false });
});

test("an empty window reads as no moods logged", () => {
  const trend = moodTrend([], FIXTURE_TODAY);

  assert.equal(trend.average, null);
  assert.equal(moodTrendSummary(trend), "No moods logged yet");
});

test("the day recalls a week, a month and every earlier year, nearest first", () => {
  const anniversaries = onThisDay(selectJournalEntries(fixtureState()), FIXTURE_TODAY);

  assert.deepEqual(
    anniversaries.map((anniversary) => [anniversary.label, anniversary.entry.dateKey]),
    [
      ["A week ago", "2026-09-13"],
      ["A month ago", "2026-08-20"],
      ["A year ago", "2025-09-20"],
      ["2 years ago", "2024-09-20"],
    ],
  );
});

test("a month ago is skipped when the day of the month does not exist there", () => {
  const entries = selectJournalEntries(fixtureState());

  assert.equal(
    onThisDay(entries, "2026-03-31").some((anniversary) => anniversary.label === "A month ago"),
    false,
  );
});

test("an excerpt drops the title heading, the syntax and the placeholders", () => {
  assert.equal(
    entryExcerpt("# Tuesday\n\n## Morning\n\n- **Ran** five miles\n...\n"),
    "Morning Ran five miles",
  );
});
