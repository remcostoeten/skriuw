import { resolveJournalDateExpression } from "../journal/date-expressions";
import {
  formatLongDate,
  isDateKey,
  mondayFirstWeekday,
  parseDateKey,
  shiftDay,
  shiftYearKeepingDay,
  type DateKey,
} from "../journal/dates";

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

const SHORTHANDS: Readonly<Record<string, string>> = {
  tod: "today",
  tom: "tomorrow",
  tmr: "tomorrow",
  tmrw: "tomorrow",
};

const SATURDAY = 5;

/** A day and month with no year, in either order: `20 nov`, `nov 20`, `20 november`. */
const DAY_AND_MONTH = /^(?:\d{1,2} [a-z]{3,}|[a-z]{3,} \d{1,2})$/;

/** `+3`, `+3d`, `+2w`, `+2 weeks`: an offset from today in days or weeks. */
const RELATIVE_OFFSET = /^\+(\d{1,3}) ?(d|days?|w|wks?|weeks?)?$/;

const PAST_TOLERANCE_DAYS = 31;

/**
 * @name nextWeekStart
 * @description The Monday that starts next week. When that Monday is
 * tomorrow, the following one, so "next week" never means the next day.
 *
 * @example
 * nextWeekStart("2026-11-04"); // "2026-11-09"
 * nextWeekStart("2026-11-08"); // "2026-11-16"
 */
export function nextWeekStart(today: DateKey): DateKey {
  const monday = shiftDay(today, 7 - mondayFirstWeekday(today));
  return monday === shiftDay(today, 1) ? shiftDay(monday, 7) : monday;
}

/**
 * @name thisWeekend
 * @description The Saturday of the coming weekend, or today when today is
 * already Saturday or Sunday.
 *
 * @example
 * thisWeekend("2026-11-04"); // "2026-11-07"
 * thisWeekend("2026-11-08"); // "2026-11-08"
 */
export function thisWeekend(today: DateKey): DateKey {
  const weekday = mondayFirstWeekday(today);
  return weekday >= SATURDAY ? today : shiftDay(today, SATURDAY - weekday);
}

function relativeOffset(normalized: string, today: DateKey): DateKey | null {
  const match = RELATIVE_OFFSET.exec(normalized);
  if (!match) {
    return null;
  }
  const weeks = match[2]?.startsWith("w") === true;
  return shiftDay(today, Number(match[1]) * (weeks ? 7 : 1));
}

function rolledForward(normalized: string, key: DateKey, today: DateKey): DateKey {
  const stale = shiftDay(today, -PAST_TOLERANCE_DAYS);
  return DAY_AND_MONTH.test(normalized) && key < stale ? shiftYearKeepingDay(key, 1) : key;
}

/**
 * @name resolveDueExpression
 * @description Reads what a user typed for a due date, after `due:` in the
 * editor or in the tasks view's date popover. A bare weekday means its next
 * occurrence, today included; `+3`, `+2w`, `next week` (next Monday),
 * `weekend`, and the shorthands `tod`, `tom`, and `tmr` are read here; a day
 * and month without a year that lies more than a month back means next year's;
 * everything else follows the journal's "Go to date" grammar anchored on
 * today. Underscores stand in for spaces so the expression stays one token.
 * Month- or year-only answers are refused because a due date names a day.
 *
 * @example
 * resolveDueExpression("tomorrow", "2026-09-30"); // "2026-10-01"
 * resolveDueExpression("next_friday", "2026-09-30"); // "2026-10-09"
 * resolveDueExpression("+3", "2026-09-30"); // "2026-10-03"
 * resolveDueExpression("2 jan", "2026-11-08"); // "2027-01-02"
 */
export function resolveDueExpression(expression: string, today: DateKey): DateKey | null {
  const trimmed = expression.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
  const normalized = SHORTHANDS[trimmed] ?? trimmed;
  if (normalized.length === 0) {
    return null;
  }
  if (normalized === "next week") {
    return nextWeekStart(today);
  }
  if (normalized === "weekend" || normalized === "this weekend") {
    return thisWeekend(today);
  }
  const offset = relativeOffset(normalized, today);
  if (offset !== null) {
    return offset;
  }
  const weekday = upcomingWeekday(normalized, today);
  if (weekday !== null) {
    return weekday;
  }
  const resolution = resolveJournalDateExpression(normalized, today, today);
  if (!resolution.ok || resolution.granularity !== "day") {
    return null;
  }
  return rolledForward(normalized, resolution.key, today);
}

export type DueQuickPick = {
  label: string;
  dueDate: DateKey;
};

/**
 * @name dueQuickPicks
 * @description The one-click dates the tasks view's date popover offers:
 * today, tomorrow, this weekend, and the start of next week.
 *
 * @example
 * dueQuickPicks("2026-11-04").map((pick) => pick.dueDate);
 * // ["2026-11-04", "2026-11-05", "2026-11-07", "2026-11-09"]
 */
export function dueQuickPicks(today: DateKey): DueQuickPick[] {
  return [
    { label: "Today", dueDate: today },
    { label: "Tomorrow", dueDate: shiftDay(today, 1) },
    { label: "This weekend", dueDate: thisWeekend(today) },
    { label: "Next week", dueDate: nextWeekStart(today) },
  ];
}

/**
 * @name daysLate
 * @description How many days an open task is past its due date, or 0 when it
 * is not late.
 *
 * @example
 * daysLate("2026-09-27", "2026-09-30"); // 3
 * daysLate("2026-10-02", "2026-09-30"); // 0
 */
export function daysLate(dueDate: DateKey, today: DateKey): number {
  return Math.max(0, daysBetween(dueDate, today));
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
