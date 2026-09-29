import { resolveJournalDateExpression } from "@skriuw/renderer-core/journal/date-expressions";
import {
  formatLongDate,
  isDateKey,
  mondayFirstWeekday,
  parseDateKey,
  shiftDay,
  type DateKey,
} from "@skriuw/renderer-core/journal/dates";

export const DUE_DATE_SIGNIFIER = "📅";

export type DueBucket = "overdue" | "today" | "upcoming" | "none" | "earlier";

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

const SHORT_WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "short" });
const MONTH_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * @name isDueDate
 * @description True when `value` is a `YYYY-MM-DD` string naming a real calendar
 * day, the only shape a task due date takes in documents, Markdown, and records.
 *
 * @example
 * isDueDate("2026-10-01"); // true
 * isDueDate("2026-02-30"); // false
 */
export function isDueDate(value: unknown): value is DateKey {
  return typeof value === "string" && isDateKey(value);
}

function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS);
}

function upcomingWeekday(name: string, today: DateKey): DateKey | null {
  const index = WEEKDAY_NAMES.findIndex(
    (weekday) => weekday === name || (name.length >= 3 && weekday.startsWith(name)),
  );
  if (index === -1) {
    return null;
  }
  return shiftDay(today, (index - mondayFirstWeekday(today) + 7) % 7);
}

/**
 * @name resolveDueExpression
 * @description Reads what a user typed after `due:` into a due date. A bare
 * weekday means its next occurrence, today included; everything else follows the
 * journal's "Go to date" grammar anchored on today. Underscores stand in for
 * spaces so the expression stays one token. Month- or year-only answers are
 * refused because a due date names a day.
 *
 * @example
 * resolveDueExpression("tomorrow", "2026-09-30"); // "2026-10-01"
 * resolveDueExpression("next_friday", "2026-09-30"); // "2026-10-09"
 */
export function resolveDueExpression(expression: string, today: DateKey): DateKey | null {
  const normalized = expression.trim().toLowerCase().replaceAll("_", " ");
  if (normalized.length === 0) {
    return null;
  }
  const weekday = upcomingWeekday(normalized, today);
  if (weekday !== null) {
    return weekday;
  }
  const resolution = resolveJournalDateExpression(normalized, today, today);
  return resolution.ok && resolution.granularity === "day" ? resolution.key : null;
}

/**
 * @name dueBucket
 * @description The tasks-view group a task belongs to. Only open work is ever
 * overdue: a completed task whose date has passed moves to `earlier` instead of
 * nagging, while completed work due today or later keeps its date group.
 *
 * @example
 * dueBucket("2026-09-01", false, "2026-09-30"); // "overdue"
 * dueBucket("2026-09-01", true, "2026-09-30"); // "earlier"
 */
export function dueBucket(dueDate: DateKey | null, done: boolean, today: DateKey): DueBucket {
  if (dueDate === null) {
    return "none";
  }
  if (dueDate < today) {
    return done ? "earlier" : "overdue";
  }
  return dueDate === today ? "today" : "upcoming";
}

/**
 * @name formatDueLabel
 * @description The compact label a due-date chip shows: a relative word for the
 * days around today, the weekday within the coming week, and a month and day
 * otherwise, with the year only when it differs from today's.
 *
 * @example
 * formatDueLabel("2026-10-01", "2026-09-30"); // "Tomorrow"
 * formatDueLabel("2026-11-12", "2026-09-30"); // "Nov 12"
 */
export function formatDueLabel(dueDate: DateKey, today: DateKey): string {
  const offset = daysBetween(today, dueDate);
  if (offset === 0) {
    return "Today";
  }
  if (offset === 1) {
    return "Tomorrow";
  }
  if (offset === -1) {
    return "Yesterday";
  }
  const date = parseDateKey(dueDate);
  if (offset > 1 && offset < 7) {
    return SHORT_WEEKDAY.format(date);
  }
  return dueDate.slice(0, 4) === today.slice(0, 4)
    ? MONTH_DAY.format(date)
    : MONTH_DAY_YEAR.format(date);
}

/**
 * @name describeDueDate
 * @description The full sentence a screen reader hears for a due date, including
 * whether it has passed.
 *
 * @example
 * describeDueDate("2026-09-01", false, "2026-09-30"); // "Overdue, due Tuesday, September 1, 2026"
 */
export function describeDueDate(dueDate: DateKey, done: boolean, today: DateKey): string {
  const long = formatLongDate(dueDate);
  return dueBucket(dueDate, done, today) === "overdue" ? `Overdue, due ${long}` : `Due ${long}`;
}
