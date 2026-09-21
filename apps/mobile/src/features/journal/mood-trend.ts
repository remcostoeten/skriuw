/**
 * The Stats strip's projection, shared word for word with
 * `apps/workspace/src/features/journal/mood-trend.ts` and specified in
 * `docs/specs/journal-daily.md` under "Mood trend".
 */

import { shiftDay, type DateKey } from "./dates";
import { MOOD_LEVELS, MOOD_OPTIONS, type JournalEntry, type MoodLevel } from "./model";

export type MoodTrendDay = {
  dateKey: DateKey;
  mood: MoodLevel | null;
  hasEntry: boolean;
};

export type MoodDirection = "up" | "down" | "steady";

export type MoodTrend = {
  days: MoodTrendDay[];
  counts: Record<MoodLevel, number>;
  ratedDays: number;
  /** Mean mood score over the rated days, from -2 (rough) to 2 (great). */
  average: number | null;
  /** Second half of the window against the first; null until both halves hold two rated days. */
  direction: MoodDirection | null;
};

export const MOOD_TREND_SPAN = 30;

const MOOD_SCORE: Record<MoodLevel, number> = {
  great: 2,
  good: 1,
  neutral: 0,
  low: -1,
  rough: -2,
};

const DIRECTION_THRESHOLD = 0.5;
const HALF_MINIMUM = 2;

function emptyCounts(): Record<MoodLevel, number> {
  return { great: 0, good: 0, neutral: 0, low: 0, rough: 0 };
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compareHalves(days: readonly MoodTrendDay[]): MoodDirection | null {
  const middle = Math.floor(days.length / 2);
  function scores(slice: readonly MoodTrendDay[]) {
    return slice.flatMap((day) => (day.mood === null ? [] : [MOOD_SCORE[day.mood]]));
  }
  const earlier = scores(days.slice(0, middle));
  const later = scores(days.slice(middle));
  if (earlier.length < HALF_MINIMUM || later.length < HALF_MINIMUM) {
    return null;
  }
  const delta = (mean(later) ?? 0) - (mean(earlier) ?? 0);
  if (delta >= DIRECTION_THRESHOLD) {
    return "up";
  }
  if (delta <= -DIRECTION_THRESHOLD) {
    return "down";
  }
  return "steady";
}

/**
 * The last `span` days ending on `today`, oldest first, each carrying the mood
 * of its entry. Pure over the projected entry list so the sidebar never waits
 * on storage; unrated and missing days stay in the row so gaps are visible.
 */
export function moodTrend(
  entries: readonly JournalEntry[],
  today: DateKey,
  span: number = MOOD_TREND_SPAN,
): MoodTrend {
  const byDate = new Map(entries.map((entry) => [entry.dateKey, entry]));
  const days: MoodTrendDay[] = [];
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const dateKey = shiftDay(today, -offset);
    const entry = byDate.get(dateKey);
    days.push({ dateKey, mood: entry?.mood ?? null, hasEntry: entry !== undefined });
  }
  const counts = emptyCounts();
  const scores: number[] = [];
  for (const day of days) {
    if (day.mood !== null) {
      counts[day.mood] += 1;
      scores.push(MOOD_SCORE[day.mood]);
    }
  }
  return {
    days,
    counts,
    ratedDays: scores.length,
    average: mean(scores),
    direction: compareHalves(days),
  };
}

/** The level whose score is nearest the average, so "Mostly good" matches the bars. */
export function dominantMood(trend: MoodTrend): MoodLevel | null {
  if (trend.average === null) {
    return null;
  }
  const average = trend.average;
  return MOOD_LEVELS.reduce((best, level) =>
    Math.abs(MOOD_SCORE[level] - average) < Math.abs(MOOD_SCORE[best] - average) ? level : best,
  );
}

export function moodTrendSummary(trend: MoodTrend): string {
  const dominant = dominantMood(trend);
  if (dominant === null) {
    return "No moods logged yet";
  }
  const lead = `Mostly ${MOOD_OPTIONS[dominant].label.toLowerCase()}`;
  if (trend.direction === "up") {
    return `${lead}, lifting lately`;
  }
  if (trend.direction === "down") {
    return `${lead}, dipping lately`;
  }
  return trend.direction === "steady" ? `${lead}, holding steady` : lead;
}

/** Bar height as a fraction of the strip, rough at the bottom and great at the top. */
export function moodBarLevel(mood: MoodLevel): number {
  return (MOOD_SCORE[mood] + 3) / 5;
}
