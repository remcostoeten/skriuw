import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import { isDateKey, shiftDay, type DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import type { JournalEntry } from "./model";

export const JOURNAL_WORD_GOAL_SETTING = "journalWordGoals";

export const WORD_GOAL_PRESETS: readonly number[] = [250, 500, 750];

export const MAX_WORD_GOAL = 100_000;

const MAX_GOAL_CHANGES = 100;

export type WordGoalChange = {
  from: DateKey;
  words: number;
};

export type WordGoalMilestone = "halfway" | "reached";

export type WordGoalStats = {
  metDays: number;
  streak: number;
  metDates: ReadonlySet<DateKey>;
};

function isWordGoal(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_WORD_GOAL;
}

function parseChange(value: unknown): WordGoalChange | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  // Safe: every field is type-checked below before it is used.
  const candidate = value as Partial<Record<keyof WordGoalChange, unknown>>;
  const { from, words } = candidate;
  if (typeof from !== "string" || !isDateKey(from) || typeof words !== "number") {
    return null;
  }
  return isWordGoal(words) ? { from, words } : null;
}

/**
 * @name wordGoalHistory
 * @description Reads the journal word goal history from workspace settings,
 * oldest change first. Each change applies from its day until the next one, and
 * zero words means the goal is off. Malformed entries are skipped, so a damaged
 * setting reads as fewer changes instead of failing the journal.
 *
 * @example
 * const history = wordGoalHistory(state.settings);
 * const goal = wordGoalOn(history, "2026-09-29");
 */
export function wordGoalHistory(settings: WorkspaceSettings): WordGoalChange[] {
  const value = settings[JOURNAL_WORD_GOAL_SETTING];
  if (!Array.isArray(value)) {
    return [];
  }
  const byDay = new Map<DateKey, WordGoalChange>();
  for (const item of value) {
    const change = parseChange(item);
    if (change !== null) {
      byDay.set(change.from, change);
    }
  }
  return [...byDay.values()].sort((left, right) => left.from.localeCompare(right.from));
}

/**
 * @name wordGoalOn
 * @description The word goal that applied on a day: the latest change made on
 * or before it. Null when no goal had been set yet or the goal was off.
 *
 * @example
 * wordGoalOn([{ from: "2026-09-01", words: 500 }], "2026-09-12"); // 500
 */
export function wordGoalOn(history: readonly WordGoalChange[], dateKey: DateKey): number | null {
  let words = 0;
  for (const change of history) {
    if (change.from > dateKey) {
      break;
    }
    words = change.words;
  }
  return words > 0 ? words : null;
}

/**
 * @name changeWordGoal
 * @description Records a new daily goal starting on `today`, leaving earlier
 * days on the goal that applied to them. A second change on the same day
 * replaces the first, and a change that repeats the goal already in force
 * returns the settings unchanged so no write is queued.
 *
 * @example
 * updateSettings(store, changeWordGoal(store.getState().settings, 750, todayKey()));
 */
export function changeWordGoal(
  settings: WorkspaceSettings,
  words: number,
  today: DateKey,
): WorkspaceSettings {
  const next = Math.min(MAX_WORD_GOAL, Math.max(0, Math.round(words)));
  const history = wordGoalHistory(settings);
  const hasLaterChange = history.some((change) => change.from > today);
  if ((wordGoalOn(history, today) ?? 0) === next && !hasLaterChange) {
    return settings;
  }
  const earlier = history.filter((change) => change.from < today);
  const previous = earlier.at(-1)?.words ?? 0;
  const changes = previous === next ? earlier : [...earlier, { from: today, words: next }];
  return { ...settings, [JOURNAL_WORD_GOAL_SETTING]: changes.slice(-MAX_GOAL_CHANGES) };
}

/**
 * @name parseWordGoalInput
 * @description Parses a typed custom goal. Returns null for anything that is
 * not a whole number between 1 and the maximum goal.
 *
 * @example
 * parseWordGoalInput(" 1200 "); // 1200
 */
export function parseWordGoalInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const words = Number(trimmed);
  return words >= 1 && words <= MAX_WORD_GOAL ? words : null;
}

/**
 * @name wordGoalFraction
 * @description How far a day is toward its goal, clamped to the range 0 to 1.
 *
 * @example
 * wordGoalFraction(250, 500); // 0.5
 */
export function wordGoalFraction(words: number, goal: number): number {
  return goal <= 0 ? 0 : Math.min(1, Math.max(0, words / goal));
}

/**
 * @name crossedWordGoalMilestone
 * @description The milestone passed when a day's count moves from `before` to
 * `after`, so progress is announced once at halfway and once at the goal
 * rather than on every save. Falling back below a milestone announces nothing.
 *
 * @example
 * crossedWordGoalMilestone(240, 260, 500); // "halfway"
 */
export function crossedWordGoalMilestone(
  before: number,
  after: number,
  goal: number,
): WordGoalMilestone | null {
  if (goal <= 0 || after <= before) {
    return null;
  }
  if (before < goal && after >= goal) {
    return "reached";
  }
  const half = goal / 2;
  return before < half && after >= half ? "halfway" : null;
}

/**
 * @name wordGoalStats
 * @description Goal-met days and the current goal streak over the projected
 * journal entries. Each day is measured against the goal that applied on it.
 * The streak counts consecutive met days ending today, or yesterday while
 * today has not met its goal yet.
 *
 * @example
 * const stats = wordGoalStats(entries, wordGoalHistory(settings), todayKey());
 */
export function wordGoalStats(
  entries: readonly JournalEntry[],
  history: readonly WordGoalChange[],
  today: DateKey,
): WordGoalStats {
  const metDates = new Set<DateKey>();
  for (const entry of entries) {
    const goal = wordGoalOn(history, entry.dateKey);
    if (goal !== null && entry.wordCount >= goal) {
      metDates.add(entry.dateKey);
    }
  }
  let cursor = metDates.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (metDates.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return { metDays: metDates.size, streak, metDates };
}

let parsedHistory: { raw: WorkspaceSettings[string]; history: WordGoalChange[] } | null = null;

/**
 * @name selectWordGoalHistory
 * @description Store selector for the word goal history. The parsed list is
 * reused while the raw setting keeps its identity, so subscribers re-render
 * only when the goal itself changes.
 *
 * @example
 * const history = useRendererSelector(store, selectWordGoalHistory);
 */
export function selectWordGoalHistory(state: RendererState): WordGoalChange[] {
  const raw = state.settings[JOURNAL_WORD_GOAL_SETTING];
  if (parsedHistory !== null && parsedHistory.raw === raw) {
    return parsedHistory.history;
  }
  const history = wordGoalHistory(state.settings);
  parsedHistory = { raw, history };
  return history;
}
